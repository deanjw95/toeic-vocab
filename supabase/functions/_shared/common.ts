import { createClient } from 'npm:@supabase/supabase-js@2';

export const APP_URL = Deno.env.get('APP_URL') ?? 'https://deanjw95.github.io/toeic-vocab/';

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Telegram ----------

export async function tg(method: string, body: Record<string, unknown>) {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim().replace(/^bot/, '');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!d.ok) console.error('telegram', method, d.description);
  return d;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- Space data ----------

export interface Entry {
  id: string;
  word: string;
  pos: string;
  meaning: string;
  example: string;
  exampleKo?: string;
}

export interface CardRecord {
  id: string;
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface LogRecord {
  id: string;
  entryId: string;
  grade: 1 | 2 | 3 | 4;
  reviewedAt: number;
  durationMs: number;
  mode: 'card' | 'choice' | 'typing';
}

export interface SpaceData {
  entries: Map<string, Entry>;
  cards: Map<string, CardRecord>;
  logs: LogRecord[];
  retention: number;
}

/** Loads every live record of a space. A solo vocab list stays well under a few thousand rows. */
export async function loadSpace(space: string): Promise<SpaceData> {
  const out: SpaceData = { entries: new Map(), cards: new Map(), logs: [], retention: 0.9 };
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('items')
      .select('kind,id,data')
      .eq('space', space)
      .not('data', 'is', null)
      .order('seq')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of data) {
      if (r.kind === 'entry') out.entries.set(r.id, r.data);
      else if (r.kind === 'card') out.cards.set(r.id, r.data);
      else if (r.kind === 'log') out.logs.push(r.data);
      else if (r.kind === 'settings' && typeof r.data?.retention === 'number') out.retention = r.data.retention;
    }
    if (data.length < PAGE) break;
  }
  return out;
}

export function dueEntries(d: SpaceData, now = Date.now()) {
  return [...d.cards.values()]
    .filter((c) => c.due <= now && d.entries.has(c.id))
    .sort((a, b) => a.due - b.due)
    .map((c) => d.entries.get(c.id)!);
}

/** KST calendar date "YYYY-MM-DD" and minutes since KST midnight. */
export function kstNow(t = Date.now()) {
  const k = new Date(t + 9 * 3_600_000);
  return { date: k.toISOString().slice(0, 10), minutes: k.getUTCHours() * 60 + k.getUTCMinutes() };
}

export function kstDayStart(t = Date.now()) {
  const k = t + 9 * 3_600_000;
  return k - (k % 86_400_000) - 9 * 3_600_000;
}
