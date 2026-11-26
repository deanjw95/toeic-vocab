// Pronunciation. Single words play a human recording (Wiktionary audio via dictionaryapi.dev)
// in the chosen TOEIC accent when one exists; phrases, sentences and words without a recording
// fall back to the best speech-synthesis voice on the device.

export type Accent = 'us' | 'uk' | 'au' | 'ca';
export const ACCENTS: { key: Accent; label: string; lang: string }[] = [
  { key: 'us', label: '미국', lang: 'en-US' },
  { key: 'uk', label: '영국', lang: 'en-GB' },
  { key: 'au', label: '호주', lang: 'en-AU' },
  { key: 'ca', label: '캐나다', lang: 'en-CA' },
];

let accent: Accent = 'us';
export const setAccent = (a: Accent) => { accent = a; };

const CACHE_KEY = 'pron-cache-v1';
type Recs = Partial<Record<Accent | 'other', string>>;
let cache: Record<string, Recs> | null = null;
function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'); } catch { cache = {}; }
  return cache!;
}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* storage full or blocked */ }
}

/** Picks the recording for an accent from dictionaryapi.dev phonetics (file names end in -us/-uk/-au/-ca). */
export function pickRecordings(data: unknown): Recs {
  const out: Recs = {};
  if (!Array.isArray(data)) return out;
  for (const entry of data) {
    for (const p of entry?.phonetics ?? []) {
      const url: string = p?.audio ?? '';
      if (!url) continue;
      const m = url.match(/-(us|uk|au|ca)\.mp3$/i);
      const k = (m ? m[1].toLowerCase() : 'other') as Accent | 'other';
      out[k] ??= url.startsWith('//') ? `https:${url}` : url;
    }
  }
  return out;
}

async function recordings(word: string): Promise<Recs> {
  const c = loadCache();
  const k = word.toLowerCase();
  if (c[k]) return c[k];
  try {
    const r = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(k)}`);
    const recs = r.ok ? pickRecordings(await r.json()) : {};
    if (r.ok || r.status === 404) { c[k] = recs; saveCache(); }
    return recs;
  } catch {
    return {}; // offline: synthesize this time, try again later
  }
}

/** Order of preference for recordings when the chosen accent has none. */
const FALLBACK: Record<Accent, (Accent | 'other')[]> = {
  us: ['us', 'ca', 'other', 'uk', 'au'],
  uk: ['uk', 'au', 'other', 'us', 'ca'],
  au: ['au', 'uk', 'other', 'us', 'ca'],
  ca: ['ca', 'us', 'other', 'uk', 'au'],
};

/** Higher is better: neural/premium voices first, then Google's, then anything in the accent. */
export function voiceScore(v: { name: string; lang: string; localService?: boolean }, lang: string) {
  const l = v.lang.replace('_', '-');
  if (!l.toLowerCase().startsWith('en')) return -1;
  let s = l.toLowerCase() === lang.toLowerCase() ? 100 : 10;
  if (/premium|enhanced|neural|natural/i.test(v.name)) s += 50;
  if (/google/i.test(v.name)) s += 30;
  if (/siri/i.test(v.name)) s += 25;
  if (/samantha|ava|daniel|karen|serena|allison|susan|tom/i.test(v.name)) s += 15;
  if (/compact|novelty|bad news|bells|bubbles|whisper|zarvox|trinoids|albert|jester|organ/i.test(v.name)) s -= 80;
  return s;
}

function bestVoice(lang: string) {
  const vs = window.speechSynthesis.getVoices();
  return [...vs].sort((a, b) => voiceScore(b, lang) - voiceScore(a, lang))[0] ?? null;
}

function synthesize(text: string) {
  if (!('speechSynthesis' in window)) return;
  const s = window.speechSynthesis;
  const lang = ACCENTS.find((a) => a.key === accent)!.lang;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  const v = bestVoice(lang);
  if (v) u.voice = v;
  s.speak(u);
}

let current: HTMLAudioElement | null = null;

export async function speak(text: string) {
  current?.pause();
  window.speechSynthesis?.cancel();
  const t = text.trim();
  if (/^[A-Za-z'-]+$/.test(t)) {
    const recs = await recordings(t);
    const url = FALLBACK[accent].map((k) => recs[k]).find(Boolean);
    if (url) {
      current = new Audio(url);
      try { await current.play(); return; } catch { /* blocked or broken file: synthesize */ }
    }
  }
  synthesize(t);
}

/** Warm the voice list (some browsers load it async). */
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices());
}
