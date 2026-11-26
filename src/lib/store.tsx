import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as store from './db';
import * as sync from './sync';
import { mergeSameWords } from './words';
import { gradeCard, LEECH_LAPSES, MASTERED_DAYS, startOfDay } from './srs';
import { DEFAULT_SETTINGS, type CardRecord, type ExamplesStatus, type Entry, type Grade, type ReviewLogRecord, type Settings } from './types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export interface SyncStatus {
  on: boolean;
  key?: string;
  busy: boolean;
  lastAt?: number;
  error?: string;
  telegram: boolean;
}

export interface WrongItem {
  entry: Entry;
  misses: number;
  leech: boolean;
}

interface Ctx {
  ready: boolean;
  entries: Entry[];
  cards: Map<string, CardRecord>;
  logs: ReviewLogRecord[];
  settings: Settings;
  dueEntries: Entry[];
  newEntriesToday: Entry[];
  newLeftToday: number;
  wrong: WrongItem[];
  streak: number;
  isMastered: (id: string) => boolean;
  grade: (id: string, g: Grade, mode: ReviewLogRecord['mode'], durationMs: number) => Promise<CardRecord>;
  addEntries: (list: Omit<Entry, 'id' | 'createdAt' | 'updatedAt'>[]) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  updateEntry: (id: string, patch: Partial<Omit<Entry, 'id'>>) => Promise<void>;
  /** The learner met a saved word again without knowing it: count it and bring the card back. */
  reencounter: (id: string) => Promise<void>;
  clearWrong: (id: string) => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<void>;
  resetProgress: () => Promise<void>;
  syncStatus: SyncStatus;
  examples: ExamplesStatus;
  requestExamples: () => Promise<void>;
  syncNow: () => Promise<void>;
  startSync: (key: string, create: boolean) => Promise<void>;
  stopSync: () => Promise<void>;
}

const C = createContext<Ctx | null>(null);

export function useVocab() {
  const v = useContext(C);
  if (!v) throw new Error('useVocab outside provider');
  return v;
}

export function VocabProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [cards, setCards] = useState<Map<string, CardRecord>>(new Map());
  const [logs, setLogs] = useState<ReviewLogRecord[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [clearedWrong, setClearedWrong] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [examples, setExamples] = useState<ExamplesStatus>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ on: false, busy: false, telegram: false });
  const syncing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(async () => {
    let d = await store.loadAll();
    // The app used to ship 200 built-in words. Only the user's own words are kept now;
    // tombstones make the other devices and the server drop them too.
    if (!(await store.getKv<boolean>('baseRemoved'))) {
      const ids = d.entries.filter((e) => e.source === 'base' || e.id.startsWith('b:')).map((e) => e.id);
      const gone = new Set(ids);
      const logIds = d.logs.filter((l) => gone.has(l.entryId) || l.entryId.startsWith('b:')).map((l) => l.id);
      const cardIds = d.cards.filter((c) => gone.has(c.id) || c.id.startsWith('b:')).map((c) => c.id);
      await store.removeMany(ids, cardIds, logIds);
      await Promise.all([sync.mark('entry', ids), sync.mark('card', cardIds), sync.mark('log', logIds)]);
      await store.setKv('baseRemoved', true);
      await store.setKv('seeded', true);
      d = await store.loadAll();
    }
    // One card per word: fold duplicates saved by earlier versions into the oldest entry.
    if (!(await store.getKv<boolean>('mergedWords'))) {
      const { keep, drop } = mergeSameWords(d.entries, Date.now());
      if (drop.length) {
        const into = new Map(drop.map((x) => [x.id, x.into]));
        const cards = new Map(d.cards.map((c) => [c.id, c]));
        const movedCards: CardRecord[] = [];
        for (const k of keep) {
          if (cards.has(k.id)) continue;
          const best = drop.filter((x) => x.into === k.id && cards.has(x.id)).map((x) => cards.get(x.id)!).sort((a, b) => b.reps - a.reps)[0];
          if (best) movedCards.push({ ...best, id: k.id, updatedAt: Date.now() });
        }
        const movedLogs = d.logs.filter((l) => into.has(l.entryId)).map((l) => ({ ...l, entryId: into.get(l.entryId)! }));
        const dropIds = drop.map((x) => x.id);
        await store.removeMany(dropIds, dropIds.filter((id) => cards.has(id)), []);
        await store.putEntries(keep);
        for (const c of movedCards) await store.putCard(c);
        for (const l of movedLogs) await store.addLog(l);
        await Promise.all([
          sync.mark('entry', [...dropIds, ...keep.map((k) => k.id)]),
          sync.mark('card', [...dropIds, ...movedCards.map((c) => c.id)]),
          sync.mark('log', movedLogs.map((l) => l.id)),
        ]);
        d = await store.loadAll();
      }
      await store.setKv('mergedWords', true);
    }
    const list = d.entries;
    setEntries(list.sort((a, b) => a.createdAt - b.createdAt));
    setCards(new Map(d.cards.map((c) => [c.id, c])));
    setLogs(d.logs.sort((a, b) => a.reviewedAt - b.reviewedAt));
    setSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) });
    setClearedWrong((await store.getKv<Record<string, number>>('clearedWrong')) ?? {});
    setExamples((await store.getKv<ExamplesStatus>('examples')) ?? {});
  }, []);

  const syncNow = useCallback(async () => {
    clearTimeout(timer.current);
    const conf = await sync.getConf();
    if (!conf) return setSyncStatus({ on: false, busy: false, telegram: false });
    if (syncing.current || !navigator.onLine) return;
    syncing.current = true;
    setSyncStatus((s) => ({ ...s, on: true, key: conf.key, busy: true }));
    try {
      const r = await sync.runSync();
      if (r.changed) await reload();
      const c = await sync.getConf();
      setSyncStatus({ on: true, key: conf.key, busy: false, lastAt: c?.lastAt, telegram: !!c?.telegram });
    } catch (e) {
      setSyncStatus((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : String(e) }));
    } finally {
      syncing.current = false;
    }
  }, [reload]);

  /** Sync shortly after a local change, batching quick successive edits. */
  const queueSync = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void syncNow(), 3000);
  }, [syncNow]);

  useEffect(() => {
    (async () => {
      await reload();
      setReady(true);
      void syncNow();
    })();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    const poll = setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void syncNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      clearInterval(t);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [reload, syncNow]);

  const today = startOfDay(now);

  const derived = useMemo(() => {
    const firstSeen = new Map<string, number>();
    for (const l of logs) if (!firstSeen.has(l.entryId)) firstSeen.set(l.entryId, l.reviewedAt);
    const introducedToday = [...firstSeen.values()].filter((t) => t >= today).length;
    const newLeftToday = Math.max(0, settings.newPerDay - introducedToday);
    const dueEntries = entries
      .filter((e) => cards.has(e.id) && cards.get(e.id)!.due <= now)
      .sort((a, b) => cards.get(a.id)!.due - cards.get(b.id)!.due);
    const newEntriesToday = entries.filter((e) => !cards.has(e.id)).slice(0, newLeftToday);

    const misses = new Map<string, number>();
    for (const l of logs) {
      if (l.grade === 1 && l.reviewedAt > (clearedWrong[l.entryId] ?? 0)) misses.set(l.entryId, (misses.get(l.entryId) ?? 0) + 1);
    }
    const byId = new Map(entries.map((e) => [e.id, e]));
    const wrong: WrongItem[] = [...misses.entries()]
      .filter(([id]) => byId.has(id))
      .map(([id, n]) => ({ entry: byId.get(id)!, misses: n, leech: (cards.get(id)?.lapses ?? 0) >= LEECH_LAPSES }))
      .sort((a, b) => Number(b.leech) - Number(a.leech) || b.misses - a.misses);

    // consecutive days (ending today or yesterday) with at least one review
    const days = new Set(logs.map((l) => startOfDay(l.reviewedAt)));
    let streak = 0;
    let d = days.has(today) ? today : today - 86_400_000;
    while (days.has(d)) {
      streak++;
      d = startOfDay(d - 12 * 3_600_000);
    }
    return { dueEntries, newEntriesToday, newLeftToday, wrong, streak };
  }, [entries, cards, logs, settings.newPerDay, clearedWrong, now, today]);

  const isMastered = useCallback((id: string) => (cards.get(id)?.scheduled_days ?? 0) >= MASTERED_DAYS, [cards]);

  const grade = useCallback<Ctx['grade']>(
    async (id, g, mode, durationMs) => {
      const t = new Date();
      const next = { ...gradeCard(settings.retention, id, cards.get(id), g, t), updatedAt: t.getTime() };
      const log: ReviewLogRecord = { id: uid(), entryId: id, grade: g, reviewedAt: t.getTime(), durationMs, mode };
      setCards((m) => new Map(m).set(id, next));
      setLogs((l) => [...l, log]);
      setNow(t.getTime());
      await Promise.all([store.putCard(next), store.addLog(log)]);
      await Promise.all([sync.mark('card', [id]), sync.mark('log', [log.id])]);
      queueSync();
      return next;
    },
    [cards, settings.retention, queueSync]
  );

  const addEntries = useCallback<Ctx['addEntries']>(async (list) => {
    const t = Date.now();
    const full: Entry[] = list.map((e, i) => ({ ...e, id: `u:${uid()}`, createdAt: t + i, updatedAt: t }));
    setEntries((x) => [...x, ...full]);
    await store.putEntries(full);
    await sync.mark('entry', full.map((e) => e.id));
    queueSync();
  }, [queueSync]);

  const removeEntry = useCallback(async (id: string) => {
    setEntries((x) => x.filter((e) => e.id !== id));
    setCards((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    await store.deleteEntry(id);
    await Promise.all([sync.mark('entry', [id]), sync.mark('card', [id])]);
    queueSync();
  }, [queueSync]);

  const updateEntry = useCallback<Ctx['updateEntry']>(async (id, patch) => {
    const cur = entries.find((e) => e.id === id);
    if (!cur) return;
    const next: Entry = { ...cur, ...patch, id, updatedAt: Date.now() };
    setEntries((x) => x.map((e) => (e.id === id ? next : e)));
    await store.putEntries([next]);
    await sync.mark('entry', [id]);
    queueSync();
  }, [entries, queueSync]);

  const reencounter = useCallback<Ctx['reencounter']>(async (id) => {
    const cur = entries.find((e) => e.id === id);
    if (!cur) return;
    await updateEntry(id, { encounters: (cur.encounters ?? 0) + 1 });
    if (cards.has(id)) await grade(id, 1, 'readd', 0); // forgot it: review again soon, shows in 오답노트
  }, [entries, cards, updateEntry, grade]);

  const clearWrong = useCallback(async (id: string) => {
    const next = { ...clearedWrong, [id]: Date.now() };
    setClearedWrong(next);
    await store.setKv('clearedWrong', next);
    await store.setKv('clearedWrongAt', Date.now());
    await sync.mark('settings', ['clearedWrong']);
    queueSync();
  }, [clearedWrong, queueSync]);

  const saveSettings = useCallback(async (s: Partial<Settings>) => {
    const next = { ...settings, ...s };
    setSettings(next);
    await store.setKv('settings', next);
    await store.setKv('mainAt', Date.now());
    await sync.mark('settings', ['main']);
    queueSync();
  }, [settings, queueSync]);

  const exportBackup = useCallback(
    () => JSON.stringify({ app: 'toeic-vocab', version: 2, exportedAt: new Date().toISOString(), entries, cards: [...cards.values()], logs, settings, clearedWrong }),
    [entries, cards, logs, settings, clearedWrong]
  );

  const importBackup = useCallback(async (json: string) => {
    const d = JSON.parse(json);
    if (d?.app !== 'toeic-vocab' || !Array.isArray(d.entries)) throw new Error('이 앱의 백업 파일이 아닙니다.');
    const s: Settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}) };
    await store.replaceAll({ entries: d.entries, cards: d.cards ?? [], logs: d.logs ?? [], settings: s });
    await store.setKv('clearedWrong', d.clearedWrong ?? {});
    setEntries([...d.entries].sort((a: Entry, b: Entry) => a.createdAt - b.createdAt));
    setCards(new Map((d.cards ?? []).map((c: CardRecord) => [c.id, c])));
    setLogs(d.logs ?? []);
    setSettings(s);
    setClearedWrong(d.clearedWrong ?? {});
    const t = Date.now();
    await Promise.all([store.setKv('mainAt', t), store.setKv('clearedWrongAt', t)]);
    await Promise.all([
      sync.mark('entry', d.entries.map((e: Entry) => e.id)),
      sync.mark('card', (d.cards ?? []).map((c: CardRecord) => c.id)),
      sync.mark('log', (d.logs ?? []).map((l: ReviewLogRecord) => l.id)),
      sync.mark('settings', ['main', 'clearedWrong']),
    ]);
    queueSync();
  }, [queueSync]);

  const resetProgress = useCallback(async () => {
    await Promise.all([sync.mark('card', [...cards.keys()]), sync.mark('log', logs.map((l) => l.id))]);
    await store.clearProgress();
    await store.setKv('clearedWrong', {});
    await store.setKv('clearedWrongAt', Date.now());
    await sync.mark('settings', ['clearedWrong']);
    setCards(new Map());
    setLogs([]);
    setClearedWrong({});
    queueSync();
  }, [cards, logs, queueSync]);

  const startSync = useCallback(async (key: string, create: boolean) => {
    setSyncStatus((s) => ({ ...s, busy: true, error: undefined }));
    try {
      const r = await sync.connect(key, create);
      if (r.changed) await reload();
      const c = await sync.getConf();
      setSyncStatus({ on: true, key, busy: false, lastAt: c?.lastAt, telegram: !!c?.telegram });
    } catch (e) {
      setSyncStatus({ on: false, busy: false, telegram: false });
      throw e;
    }
  }, [reload]);

  /** Asks the Mac example agent to run now; it polls the synced 'examples' row. */
  const requestExamples = useCallback(async () => {
    const t = Date.now();
    const next = { ...examples, requestedAt: t };
    setExamples(next);
    await store.setKv('examples', next);
    await store.setKv('examplesAt', t);
    await sync.mark('settings', ['examples']);
    await syncNow();
  }, [examples, syncNow]);

  const stopSync = useCallback(async () => {
    await sync.disconnect();
    setSyncStatus({ on: false, busy: false, telegram: false });
  }, []);

  const value: Ctx = {
    ready, entries, cards, logs, settings, ...derived, isMastered,
    grade, addEntries, removeEntry, updateEntry, reencounter, clearWrong, saveSettings, exportBackup, importBackup, resetProgress,
    syncStatus, syncNow, startSync, stopSync, examples, requestExamples,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
