// Two simulated devices syncing through an in-memory copy of the server (push_items + seq pull).
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = { kind: string; id: string; data: unknown; updated_at: number; seq?: number };

function fakeServer() {
  const spaces = new Set<string>();
  const items = new Map<string, Row & { space: string; seq: number }>();
  let seq = 0;
  const handler = async (_url: string, init: { body: string }) => {
    const b = JSON.parse(init.body);
    const space = b.key;
    const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (!spaces.has(space)) {
      if (b.action === 'sync' && b.create) spaces.add(space);
      else return reply(404, { error: 'not found' });
    }
    for (const r of b.rows ?? []) {
      const k = `${space}|${r.kind}|${r.id}`;
      const cur = items.get(k);
      seq++;
      if (!cur || cur.updated_at <= r.updated_at) items.set(k, { ...r, space, seq });
    }
    const rows = [...items.values()].filter((r) => r.space === space && r.seq > (b.since ?? 0)).sort((a, b) => a.seq - b.seq);
    return reply(200, { rows, seq: rows.length ? rows[rows.length - 1].seq : b.since, more: false, telegram: false });
  };
  return { handler, items };
}

/** Fresh modules + fresh IndexedDB = a separate device. */
async function device() {
  vi.resetModules();
  globalThis.indexedDB = new IDBFactory();
  const db = await import('../src/lib/db');
  const sync = await import('../src/lib/sync');
  return { db, sync };
}

const entry = (id: string, word: string, updatedAt: number) => ({
  id, word, pos: 'n.', meaning: word + ' 뜻', example: '', day: 0, source: 'user' as const, createdAt: updatedAt, updatedAt,
});
const card = (id: string, due: number, t: number) => ({
  id, due, stability: 1, difficulty: 5, scheduled_days: 1, learning_steps: 0, reps: 1, lapses: 0, state: 2, last_review: t, updatedAt: t,
});

let server: ReturnType<typeof fakeServer>;
beforeEach(() => {
  server = fakeServer();
  vi.stubGlobal('fetch', server.handler);
});

describe('sync', () => {
  it('merges two devices and propagates later changes', async () => {
    const KEY = 'abcde-fghjk-mnpqr-stuvw';
    const mac = await device();
    await mac.db.putEntries([entry('u:1', 'agenda', 1000)]);
    await mac.db.putCard(card('u:1', 5000, 1000));
    await mac.sync.connect(KEY, true);

    const phone = await device();
    await phone.db.putEntries([entry('u:2', 'invoice', 2000)]);
    const r = await phone.sync.connect(KEY, false);
    expect(r.changed).toBe(true);
    const pAll = await phone.db.loadAll();
    expect(pAll.entries.map((e) => e.id).sort()).toEqual(['u:1', 'u:2']);
    expect(pAll.cards[0].due).toBe(5000);

    // phone reviews u:1; mac picks it up
    await phone.db.putCard(card('u:1', 99_000, 3000));
    await phone.sync.mark('card', ['u:1']);
    await phone.sync.runSync();

    // mac's modules still hold their own (cached) database connection
    const r2 = await mac.sync.runSync();
    expect(r2.changed).toBe(true);
    const mAll = await mac.db.loadAll();
    expect(mAll.cards.find((c) => c.id === 'u:1')!.due).toBe(99_000);
    expect(mAll.entries.map((e) => e.id).sort()).toEqual(['u:1', 'u:2']);
  });

  it('keeps the newer card when both devices changed it', async () => {
    const KEY = 'zzzzz-yyyyy-xxxxx-wwwww';
    const a = await device();
    await a.db.putCard(card('c', 100, 5000)); // newer
    await a.sync.connect(KEY, true);
    const b = await device();
    await b.db.putCard(card('c', 999, 4000)); // older
    await b.sync.connect(KEY, false);
    const all = await b.db.loadAll();
    expect(all.cards.find((c) => c.id === 'c')!.due).toBe(100);
    expect((server.items.get(`${KEY}|card|c`)!.data as { due: number }).due).toBe(100);
  });

  it('propagates deletes as tombstones', async () => {
    const KEY = 'qqqqq-qqqqq-qqqqq-qqqqq';
    const a = await device();
    await a.db.putEntries([entry('u:x', 'refund', 1000)]);
    await a.sync.connect(KEY, true);
    await a.db.deleteEntry('u:x');
    await a.sync.mark('entry', ['u:x']);
    await a.sync.runSync();
    expect(server.items.get(`${KEY}|entry|u:x`)!.data).toBeNull();

    const b = await device();
    await b.sync.connect(KEY, false);
    expect((await b.db.loadAll()).entries.find((e) => e.id === 'u:x')).toBeUndefined();
  });

  it('rejects an unknown key without leaving sync on', async () => {
    const d = await device();
    await expect(d.sync.connect('nopee-nopee-nopee-nopee', false)).rejects.toThrow();
    expect(await d.sync.getConf()).toBeUndefined();
  });

  it('syncs settings but keeps the local model address per device', async () => {
    const KEY = 'sssss-sssss-sssss-sssss';
    const mac = await device();
    await mac.db.setKv('settings', { newPerDay: 35, ollamaUrl: 'http://mac:11434', ollamaModel: 'qwen' });
    await mac.db.setKv('mainAt', 10);
    await mac.sync.connect(KEY, true);
    const phone = await device();
    await phone.sync.connect(KEY, false);
    const s = (await phone.db.getKv<Record<string, unknown>>('settings'))!;
    expect(s.newPerDay).toBe(35);
    expect(s.ollamaUrl).toBeUndefined();
  });
});
