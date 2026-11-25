// Device <-> Supabase sync without accounts. A random sync key (shown to the user as a code)
// names the shared space; the server only stores its hash. Every local write is queued in
// an outbox; a sync pushes the queued records and pulls everything newer than the last seq.
// Conflicts: newer updated_at wins per record. Review logs are append-only, so they merge.
import { db } from './db';
import type { CardRecord, Entry, ReviewLogRecord, Settings } from './types';

export const FUNCTIONS_URL = 'https://qosmmsyxmucjrsnugful.supabase.co/functions/v1';
const PUBLISHABLE_KEY = 'sb_publishable_NVzV9ABgFzi62nfi51NOpA_E2fzAUSv';

export type Kind = 'entry' | 'card' | 'log' | 'settings';
interface Row {
  kind: Kind;
  id: string;
  data: unknown | null;
  updated_at: number;
}

export interface SyncConf {
  key: string;
  seq: number;
  lastAt?: number;
  telegram?: boolean;
}

/** Old settings fields that must not travel (the removed AI options held an API key). */
const LOCAL_ONLY = ['ollamaUrl', 'ollamaModel', 'geminiKey', 'geminiModel', 'aiOrder'];

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i
export function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const s = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return s.match(/.{5}/g)!.join('-');
}
export const normalizeKey = (k: string) => k.trim().toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-');

export async function getConf() {
  return (await (await db()).get('kv', 'sync')) as SyncConf | undefined;
}
async function setConf(c: SyncConf | undefined) {
  const d = await db();
  if (c) await d.put('kv', c, 'sync');
  else await d.delete('kv', 'sync');
}

/** Queue records for the next push. Cheap, so it runs even before sync is turned on. */
export async function mark(kind: Kind, ids: string[]) {
  if (!ids.length) return;
  const d = await db();
  const tx = d.transaction('kv', 'readwrite');
  const box = ((await tx.store.get('outbox')) as Record<string, number> | undefined) ?? {};
  const t = Date.now();
  for (const id of ids) box[`${kind}|${id}`] = t;
  await tx.store.put(box, 'outbox');
  await tx.done;
}

export async function call<T = Record<string, unknown>>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${FUNCTIONS_URL}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: PUBLISHABLE_KEY },
    body: JSON.stringify({ action, ...body }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `서버 오류 (${r.status})`);
  return d as T;
}

function settingsPayload(s: Settings) {
  const out: Record<string, unknown> = { ...s };
  for (const k of LOCAL_ONLY) delete out[k];
  return out;
}

async function rowFor(kind: Kind, id: string): Promise<Row> {
  const d = await db();
  const now = Date.now();
  if (kind === 'entry') {
    const e = await d.get('entries', id);
    return { kind, id, data: e ?? null, updated_at: e?.updatedAt ?? now };
  }
  if (kind === 'card') {
    const c = await d.get('cards', id);
    return { kind, id, data: c ?? null, updated_at: c ? c.updatedAt ?? c.last_review ?? now : now };
  }
  if (kind === 'log') {
    const l = await d.get('logs', id);
    return { kind, id, data: l ?? null, updated_at: l?.reviewedAt ?? now };
  }
  // settings rows: 'main' and 'clearedWrong'
  const at = ((await d.get('kv', `${id}At`)) as number | undefined) ?? 0;
  const v = await d.get('kv', id === 'main' ? 'settings' : id);
  return { kind, id, data: v ? (id === 'main' ? settingsPayload(v as Settings) : v) : null, updated_at: at };
}

async function allKeys(): Promise<string[]> {
  const d = await db();
  const [e, c, l] = await Promise.all([d.getAllKeys('entries'), d.getAllKeys('cards'), d.getAllKeys('logs')]);
  return [...e.map((k) => `entry|${k}`), ...c.map((k) => `card|${k}`), ...l.map((k) => `log|${k}`), 'settings|main', 'settings|clearedWrong'];
}

/** Applies pulled rows where they are newer than the local copy. Returns true if anything changed. */
async function apply(rows: Row[]): Promise<boolean> {
  if (!rows.length) return false;
  const d = await db();
  const tx = d.transaction(['entries', 'cards', 'logs', 'kv'], 'readwrite');
  const E = tx.objectStore('entries'), C = tx.objectStore('cards'), L = tx.objectStore('logs'), KV = tx.objectStore('kv');
  let changed = false;
  for (const r of rows) {
    if (r.kind === 'entry') {
      const cur = await E.get(r.id);
      if (cur && cur.updatedAt > r.updated_at) continue;
      if (r.data) await E.put(r.data as Entry);
      else if (cur) await E.delete(r.id);
      else continue;
    } else if (r.kind === 'card') {
      const cur = await C.get(r.id);
      if (cur && (cur.updatedAt ?? cur.last_review ?? 0) > r.updated_at) continue;
      if (r.data) await C.put({ ...(r.data as CardRecord), updatedAt: r.updated_at });
      else if (cur) await C.delete(r.id);
      else continue;
    } else if (r.kind === 'log') {
      if (r.data) await L.put(r.data as ReviewLogRecord);
      else await L.delete(r.id);
    } else if (r.kind === 'settings') {
      const at = ((await KV.get(`${r.id}At`)) as number | undefined) ?? 0;
      if (at > r.updated_at || !r.data) continue;
      if (r.id === 'main') {
        const cur = ((await KV.get('settings')) as Settings | undefined) ?? ({} as Settings);
        const next = { ...cur, ...(r.data as Partial<Settings>) };
        for (const k of LOCAL_ONLY) delete (next as Record<string, unknown>)[k];
        await KV.put(next, 'settings');
      } else {
        await KV.put(r.data, r.id);
      }
      await KV.put(r.updated_at, `${r.id}At`);
    }
    changed = true;
  }
  await tx.done;
  return changed;
}

/**
 * Push queued (or, with `all`, every) local record, then pull. `create` makes a new space
 * for a fresh key; without it an unknown key is an error, which catches typos.
 */
export async function runSync(opts: { all?: boolean; create?: boolean } = {}) {
  const conf = await getConf();
  if (!conf) return { changed: false };
  const d = await db();
  const box = ((await d.get('kv', 'outbox')) as Record<string, number> | undefined) ?? {};
  const keys = opts.all ? await allKeys() : Object.keys(box);
  const snapshotAt = Date.now();
  const rows = await Promise.all(keys.map((k) => {
    const [kind, ...id] = k.split('|');
    return rowFor(kind as Kind, id.join('|'));
  }));

  let seq = conf.seq;
  let changed = false;
  let telegram = conf.telegram;
  let first = true;
  for (;;) {
    const res = await call<{ rows: Row[]; seq: number; more: boolean; telegram: boolean }>('sync', {
      key: conf.key,
      since: seq,
      rows: first ? rows : [],
      create: opts.create,
    });
    if (first) {
      // drop what was sent, unless it changed again while in flight
      const tx = d.transaction('kv', 'readwrite');
      const cur = ((await tx.store.get('outbox')) as Record<string, number> | undefined) ?? {};
      for (const k of keys) if ((cur[k] ?? 0) <= snapshotAt) delete cur[k];
      await tx.store.put(cur, 'outbox');
      await tx.done;
    }
    first = false;
    changed = (await apply(res.rows)) || changed;
    seq = res.seq;
    telegram = res.telegram;
    if (!res.more) break;
  }
  await setConf({ ...conf, seq, lastAt: Date.now(), telegram });
  return { changed, telegram };
}

/** Start syncing with a key: a fresh one (create) or one copied from another device (join). */
export async function connect(key: string, create: boolean) {
  await setConf({ key, seq: 0 });
  try {
    return await runSync({ all: true, create });
  } catch (e) {
    await setConf(undefined);
    throw e;
  }
}

export async function disconnect() {
  await setConf(undefined);
}

export const telegramLink = (key: string) => call<{ url: string; bot: string }>('tg_link', { key });
export const telegramTest = (key: string) => call('tg_test', { key });
export const telegramUnlink = (key: string) => call('tg_unlink', { key });
