import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { CardRecord, Entry, ReviewLogRecord, Settings } from './types';

interface VocabDB extends DBSchema {
  entries: { key: string; value: Entry };
  cards: { key: string; value: CardRecord };
  logs: { key: string; value: ReviewLogRecord; indexes: { byEntry: string } };
  kv: { key: string; value: unknown };
}

let dbp: Promise<IDBPDatabase<VocabDB>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<VocabDB>('toeic-vocab', 1, {
      upgrade(d) {
        d.createObjectStore('entries', { keyPath: 'id' });
        d.createObjectStore('cards', { keyPath: 'id' });
        const logs = d.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('byEntry', 'entryId');
        d.createObjectStore('kv');
      },
    });
  }
  return dbp;
}

export async function loadAll() {
  const d = await db();
  const [entries, cards, logs, settings, seeded] = await Promise.all([
    d.getAll('entries'),
    d.getAll('cards'),
    d.getAll('logs'),
    d.get('kv', 'settings') as Promise<Partial<Settings> | undefined>,
    d.get('kv', 'seeded') as Promise<boolean | undefined>,
  ]);
  return { entries, cards, logs, settings, seeded: !!seeded };
}

export async function putEntries(list: Entry[]) {
  const tx = (await db()).transaction('entries', 'readwrite');
  await Promise.all([...list.map((e) => tx.store.put(e)), tx.done]);
}

export async function deleteEntry(id: string) {
  const d = await db();
  const tx = d.transaction(['entries', 'cards'], 'readwrite');
  await Promise.all([tx.objectStore('entries').delete(id), tx.objectStore('cards').delete(id), tx.done]);
}

export async function removeMany(entryIds: string[], cardIds: string[], logIds: string[]) {
  const d = await db();
  const tx = d.transaction(['entries', 'cards', 'logs'], 'readwrite');
  await Promise.all([
    ...entryIds.map((id) => tx.objectStore('entries').delete(id)),
    ...cardIds.map((id) => tx.objectStore('cards').delete(id)),
    ...logIds.map((id) => tx.objectStore('logs').delete(id)),
    tx.done,
  ]);
}

export async function putCard(c: CardRecord) {
  await (await db()).put('cards', c);
}

export async function addLog(l: ReviewLogRecord) {
  await (await db()).put('logs', l);
}

export async function setKv(key: string, value: unknown) {
  await (await db()).put('kv', value, key);
}

export async function getKv<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined;
}

export async function clearProgress() {
  const d = await db();
  const tx = d.transaction(['cards', 'logs'], 'readwrite');
  await Promise.all([tx.objectStore('cards').clear(), tx.objectStore('logs').clear(), tx.done]);
}

export async function replaceAll(data: { entries: Entry[]; cards: CardRecord[]; logs: ReviewLogRecord[]; settings?: Settings }) {
  const d = await db();
  const tx = d.transaction(['entries', 'cards', 'logs', 'kv'], 'readwrite');
  const e = tx.objectStore('entries'), c = tx.objectStore('cards'), l = tx.objectStore('logs'), kv = tx.objectStore('kv');
  await Promise.all([e.clear(), c.clear(), l.clear()]);
  await Promise.all([
    ...data.entries.map((x) => e.put(x)),
    ...data.cards.map((x) => c.put(x)),
    ...data.logs.map((x) => l.put(x)),
    data.settings ? kv.put(data.settings, 'settings') : Promise.resolve(),
    kv.put(true, 'seeded'),
    tx.done,
  ]);
}
