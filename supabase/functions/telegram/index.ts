// Telegram webhook: links a chat to a sync space and runs the button quiz.
import { APP_URL, db, dueEntries, esc, kstDayStart, loadSpace, tg, type Entry, type LogRecord } from '../_shared/common.ts';
import { buildChoices, formatInterval, gradeCard } from '../_shared/quiz.ts';

const ROUND = 5; // questions per quiz round
const SLOW_MS = 15_000; // a correct answer slower than this counts as Hard
const LETTERS = ['A', 'B', 'C', 'D'];

const appButton = { text: '앱 열기', url: APP_URL };

async function spaceForChat(chatId: number) {
  const { data } = await db.from('spaces').select('id').eq('tg_chat_id', chatId).maybeSingle();
  return data?.id as string | undefined;
}

async function link(chatId: number, code: string) {
  const { data } = await db.from('spaces').select('id,tg_link_expires').eq('tg_link_code', code).maybeSingle();
  if (!data || new Date(data.tg_link_expires).getTime() < Date.now()) {
    await tg('sendMessage', { chat_id: chatId, text: '연결 코드가 만료됐어요. 앱 설정에서 "텔레그램 연결"을 다시 눌러 주세요.' });
    return;
  }
  // one chat per space, one space per chat
  await db.from('spaces').update({ tg_chat_id: null }).eq('tg_chat_id', chatId);
  await db.from('spaces').update({ tg_chat_id: chatId, tg_link_code: null, tg_link_expires: null }).eq('id', data.id);
  await tg('sendMessage', {
    chat_id: chatId,
    text: '단어장과 연결됐어요. 매일 08:00, 12:30, 21:00에 복습할 단어를 알려 드릴게요.\n\n언제든 /quiz 로 바로 퀴즈를 풀 수 있어요.',
    reply_markup: { inline_keyboard: [[{ text: '지금 퀴즈 풀기', callback_data: 'q:1' }]] },
  });
}

async function status(chatId: number, space: string) {
  const d = await loadSpace(space);
  const due = dueEntries(d).length;
  const today = d.logs.filter((l) => l.reviewedAt >= kstDayStart()).length;
  await tg('sendMessage', {
    chat_id: chatId,
    text: `지금 복습할 단어 ${due}개\n오늘 푼 문제 ${today}개`,
    reply_markup: { inline_keyboard: [[...(due ? [{ text: '퀴즈 풀기', callback_data: 'q:1' }] : []), appButton]] },
  });
}

/** Sends question n of the round, or a "nothing due" note. */
async function ask(chatId: number, space: string, n: number) {
  const d = await loadSpace(space);
  const due = dueEntries(d);
  if (!due.length) {
    await tg('sendMessage', {
      chat_id: chatId,
      text: n > 1 ? '지금 복습할 단어를 다 풀었어요. 수고했어요!' : '지금은 복습할 단어가 없어요. 앱에서 새 단어를 배워 볼까요?',
      reply_markup: { inline_keyboard: [[appButton]] },
    });
    return;
  }
  const target: Entry = due[0];
  const { options, correct } = buildChoices(target, [...d.entries.values()]);
  const text = `<b>${n} / ${ROUND}</b>   남은 복습 ${due.length}개\n\n<b>${esc(target.word)}</b>  <i>${esc(target.pos)}</i>\n알맞은 뜻을 고르세요.`;
  await tg('sendMessage', {
    chat_id: chatId,
    parse_mode: 'HTML',
    text,
    reply_markup: {
      // callback_data must stay under 64 bytes: a:<picked>:<correct>:<n>:<entryId>
      inline_keyboard: options.map((o, i) => [{ text: `(${LETTERS[i]}) ${o}`, callback_data: `a:${i}:${correct}:${n}:${target.id}`.slice(0, 64) }]),
    },
  });
}

async function answer(q: TgCallback, space: string, picked: number, correct: number, n: number, entryId: string) {
  const chatId = q.message.chat.id;
  const d = await loadSpace(space);
  const entry = d.entries.get(entryId);
  const prev = d.cards.get(entryId);
  const askedAt = q.message.date * 1000;
  if (!entry || (prev?.last_review && prev.last_review > askedAt)) {
    await tg('answerCallbackQuery', { callback_query_id: q.id, text: '이미 푼 문제예요.' });
    return;
  }
  const now = new Date();
  const elapsed = now.getTime() - askedAt;
  const right = picked === correct;
  const grade = right ? (elapsed > SLOW_MS ? 2 : 3) : 1;
  const card = gradeCard(d.retention, entryId, prev, grade as 1 | 2 | 3, now);
  const log: LogRecord = { id: crypto.randomUUID(), entryId, grade: grade as 1 | 2 | 3, reviewedAt: now.getTime(), durationMs: elapsed, mode: 'choice' };
  const t = now.getTime();
  const { error } = await db.rpc('push_items', {
    p_space: space,
    p_rows: [
      { kind: 'card', id: entryId, data: card, updated_at: t },
      { kind: 'log', id: log.id, data: log, updated_at: t },
    ],
  });
  if (error) throw error;

  const options: string[] = (q.message.reply_markup?.inline_keyboard ?? []).map((row) => row[0].text);
  const when = formatInterval(card.due - t);
  const head = right
    ? `✅ 정답이에요. ${grade === 2 ? '조금 오래 걸려서 어려움으로 기록했어요. ' : ''}다음 복습은 ${when} 뒤예요.`
    : `❌ 오답이에요. 정답은 ${options[correct] ?? entry.meaning}. ${when} 뒤 다시 나와요.`;
  const example = entry.example ? `\n\n<i>${esc(entry.example)}</i>${entry.exampleKo ? `\n${esc(entry.exampleKo)}` : ''}` : '';
  await tg('editMessageText', {
    chat_id: chatId,
    message_id: q.message.message_id,
    parse_mode: 'HTML',
    text: `<b>${esc(entry.word)}</b>  <i>${esc(entry.pos)}</i>  ${esc(entry.meaning)}\n${right ? '' : `내 답: ${esc(options[picked] ?? '')}\n`}\n${head}${example}`,
  });
  await tg('answerCallbackQuery', { callback_query_id: q.id, text: right ? '정답!' : '오답' });

  if (n < ROUND) await ask(chatId, space, n + 1);
  else
    await tg('sendMessage', {
      chat_id: chatId,
      text: `${ROUND}문제를 풀었어요. 더 풀까요?`,
      reply_markup: { inline_keyboard: [[{ text: `${ROUND}문제 더`, callback_data: 'q:1' }, appButton]] },
    });
}

interface TgCallback {
  id: string;
  data?: string;
  message: {
    message_id: number;
    date: number;
    chat: { id: number };
    reply_markup?: { inline_keyboard: { text: string }[][] };
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!secret || req.headers.get('x-telegram-bot-api-secret-token') !== secret) return new Response('forbidden', { status: 403 });

  const u = await req.json();
  try {
    if (u.message?.text) {
      const chatId: number = u.message.chat.id;
      const text: string = u.message.text.trim();
      const start = text.match(/^\/start(?:\s+(\w+))?/);
      if (start?.[1]) return (await link(chatId, start[1]), new Response('ok'));
      const space = await spaceForChat(chatId);
      if (!space) {
        await tg('sendMessage', { chat_id: chatId, text: '아직 단어장과 연결되지 않았어요. 앱의 설정 → "텔레그램 연결"을 눌러 주세요.', reply_markup: { inline_keyboard: [[appButton]] } });
      } else if (/^\/quiz|^퀴즈/.test(text)) {
        await ask(chatId, space, 1);
      } else {
        await status(chatId, space);
      }
    } else if (u.callback_query) {
      const q: TgCallback = u.callback_query;
      const space = await spaceForChat(q.message.chat.id);
      if (!space) {
        await tg('answerCallbackQuery', { callback_query_id: q.id, text: '연결이 해제된 채팅이에요.' });
      } else if (q.data?.startsWith('q:')) {
        await tg('answerCallbackQuery', { callback_query_id: q.id });
        await ask(q.message.chat.id, space, 1);
      } else if (q.data?.startsWith('a:')) {
        const [, p, c, n, ...rest] = q.data.split(':');
        await answer(q, space, Number(p), Number(c), Number(n), rest.join(':'));
      }
    }
  } catch (e) {
    console.error(e); // always 200 so Telegram doesn't retry forever
  }
  return new Response('ok');
});
