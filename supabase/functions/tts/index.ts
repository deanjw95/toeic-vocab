// Neural voices for example sentences (Azure Speech). Each clip is made once per accent and
// text, then served from the public 'tts' storage bucket, so replays cost nothing.
// POST {key, text, accent} -> {url}. Only callers holding a sync key may create clips.
import { CORS, db, json, sha256 } from '../_shared/common.ts';

const VOICES: Record<string, { voice: string; lang: string }> = {
  us: { voice: 'en-US-JennyNeural', lang: 'en-US' },
  uk: { voice: 'en-GB-SoniaNeural', lang: 'en-GB' },
  au: { voice: 'en-AU-NatashaNeural', lang: 'en-AU' },
  ca: { voice: 'en-CA-ClaraNeural', lang: 'en-CA' },
};
const MAX_CHARS = 400;
const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Same normalization as the app, so both compute the same file name. */
const clipPath = async (accent: string, text: string) =>
  `${accent}/${(await sha256(text.trim().replace(/\s+/g, ' '))).slice(0, 40)}.mp3`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body: { key?: string; text?: string; accent?: string };
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }

  const text = (body.text ?? '').trim().replace(/\s+/g, ' ');
  const v = VOICES[body.accent ?? 'us'];
  if (!text || text.length > MAX_CHARS || !v) return json({ error: 'bad request' }, 400);
  if (!body.key) return json({ error: 'sync key required' }, 403);

  const { data: space } = await db.from('spaces').select('id').eq('id', await sha256(body.key)).maybeSingle();
  if (!space) return json({ error: 'unknown sync key' }, 403);

  const path = await clipPath(body.accent ?? 'us', text);
  const bucket = db.storage.from('tts');
  const url = bucket.getPublicUrl(path).data.publicUrl;
  const head = await fetch(url, { method: 'HEAD' });
  if (head.ok) return json({ url, cached: true });

  const azKey = Deno.env.get('AZURE_SPEECH_KEY');
  const region = Deno.env.get('AZURE_SPEECH_REGION');
  if (!azKey || !region) return json({ error: 'Azure 음성이 설정되지 않았어요' }, 503);

  const ssml = `<speak version="1.0" xml:lang="${v.lang}"><voice name="${v.voice}"><prosody rate="-4%">${xml(text)}</prosody></voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': azKey,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'toeic-vocab',
    },
    body: ssml,
  });
  if (!r.ok) {
    console.error('azure', r.status, await r.text());
    return json({ error: `Azure 오류 (${r.status})` }, 502);
  }
  const audio = new Uint8Array(await r.arrayBuffer());
  const { error } = await bucket.upload(path, audio, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: true });
  if (error) return json({ error: error.message }, 500);
  return json({ url });
});
