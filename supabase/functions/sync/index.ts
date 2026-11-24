// App <-> server sync and Telegram linking. Authenticated by the sync key only.
import { CORS, db, json, sha256, tg } from '../_shared/common.ts';

const PULL_LIMIT = 2000;

/** Registers the Telegram webhook from Supabase's side (GitHub runners get rate-limited). */
async function ensureWebhook() {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram`;
  const info = await tg('getWebhookInfo', {});
  if (info.ok && info.result?.url === url) return;
  await tg('setWebhook', {
    url,
    secret_token: Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),
    allowed_updates: ['message', 'callback_query'],
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'quiz', description: '복습 퀴즈 5문제' },
      { command: 'today', description: '오늘 복습 현황' },
    ],
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  let body: { action?: string; key?: string; since?: number; rows?: unknown[]; create?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const key = String(body.key ?? '');
  if (key.length < 16) return json({ error: '동기화 코드가 올바르지 않아요.' }, 400);
  const space = await sha256(key);

  const { data: sp } = await db.from('spaces').select('id,tg_chat_id').eq('id', space).maybeSingle();
  if (!sp) {
    if (body.action === 'sync' && body.create) {
      const { error } = await db.from('spaces').insert({ id: space });
      if (error) return json({ error: error.message }, 500);
    } else {
      return json({ error: '이 동기화 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.' }, 404);
    }
  }

  try {
    switch (body.action) {
      case 'sync': {
        const rows = Array.isArray(body.rows) ? body.rows : [];
        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await db.rpc('push_items', { p_space: space, p_rows: rows.slice(i, i + 500) });
          if (error) throw error;
        }
        const since = Number(body.since) || 0;
        const { data, error } = await db
          .from('items')
          .select('kind,id,data,updated_at,seq')
          .eq('space', space)
          .gt('seq', since)
          .order('seq')
          .limit(PULL_LIMIT);
        if (error) throw error;
        const seq = data.length ? data[data.length - 1].seq : since;
        return json({ rows: data, seq, more: data.length === PULL_LIMIT, telegram: !!sp?.tg_chat_id });
      }

      case 'tg_link': {
        const code = crypto.randomUUID().replace(/-/g, '').slice(0, 12);
        const expires = new Date(Date.now() + 15 * 60_000).toISOString();
        const { error } = await db.from('spaces').update({ tg_link_code: code, tg_link_expires: expires }).eq('id', space);
        if (error) throw error;
        const me = await tg('getMe', {});
        if (!me.ok) return json({ error: '텔레그램 봇이 아직 설정되지 않았어요.' }, 503);
        await ensureWebhook();
        return json({ url: `https://t.me/${me.result.username}?start=${code}`, bot: me.result.username });
      }

      case 'tg_test': {
        if (!sp?.tg_chat_id) return json({ error: '아직 텔레그램이 연결되지 않았어요.' }, 400);
        await tg('sendMessage', { chat_id: sp.tg_chat_id, text: '알림 테스트예요. 08:00, 12:30, 21:00에 복습 알림을 보낼게요.' });
        return json({ ok: true });
      }

      case 'tg_unlink': {
        if (sp?.tg_chat_id) await tg('sendMessage', { chat_id: sp.tg_chat_id, text: '단어장 알림 연결을 해제했어요.' });
        await db.from('spaces').update({ tg_chat_id: null }).eq('id', space);
        return json({ ok: true });
      }

      default:
        return json({ error: 'unknown action' }, 400);
    }
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
