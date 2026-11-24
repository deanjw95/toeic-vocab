// Called by pg_cron at 08:00, 12:30 and 21:00 KST. Sends each linked chat a review reminder.
// Public, but harmless: it only sends within 30 minutes after a slot and once per slot per day.
import { APP_URL, db, dueEntries, kstDayStart, kstNow, loadSpace, tg } from '../_shared/common.ts';

const SLOTS: Record<string, number> = { '0800': 8 * 60, '1230': 12 * 60 + 30, '2100': 21 * 60 };
const WINDOW_MIN = 30;

Deno.serve(async (req) => {
  const { slot } = await req.json().catch(() => ({}));
  const at = SLOTS[slot as string];
  if (at === undefined) return new Response('unknown slot', { status: 400 });
  const { date, minutes } = kstNow();
  if (minutes < at || minutes > at + WINDOW_MIN) return new Response('outside window');

  const { data: spaces, error } = await db.from('spaces').select('id,tg_chat_id,sent_slots').not('tg_chat_id', 'is', null);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const s of spaces) {
    if (s.sent_slots?.[slot] === date) continue;
    await db.from('spaces').update({ sent_slots: { ...s.sent_slots, [slot]: date } }).eq('id', s.id);
    try {
      const d = await loadSpace(s.id);
      const due = dueEntries(d).length;
      const today = d.logs.filter((l) => l.reviewedAt >= kstDayStart()).length;
      const lines: string[] = [];
      if (due) lines.push(`📚 복습할 단어 ${due}개가 기다려요.`);
      else lines.push(slot === '2100' ? '오늘 복습은 모두 끝났어요. 👏' : '지금 복습할 단어는 없어요. 새 단어를 배워 볼까요?');
      if (today) lines.push(`오늘 ${today}문제 풀었어요.`);
      if (due) lines.push('', '버튼을 누르면 여기서 바로 5문제를 풀 수 있어요.');
      await tg('sendMessage', {
        chat_id: s.tg_chat_id,
        text: lines.join('\n'),
        reply_markup: { inline_keyboard: [[...(due ? [{ text: '퀴즈 풀기', callback_data: 'q:1' }] : []), { text: '앱 열기', url: APP_URL }]] },
      });
      sent++;
    } catch (e) {
      console.error(s.id, e);
    }
  }
  return new Response(`sent ${sent}`);
});
