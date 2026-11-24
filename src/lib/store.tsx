import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BASE_WORDS } from './baseWords';
import * as store from './db';
import * as sync from './sync';
import { gradeCard, LEECH_LAPSES, MASTERED_DAYS, startOfDay } from './srs';
import { DEFAULT_SETTINGS, type CardRecord, type Entry, type Grade, type ReviewLogRecord, type Settings } from './types';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function baseEntries(): Entry[] {
  const now = Date.now();
  return BASE_WORDS.map((w, i) => ({
    id: `b:${w.word}`,
    word: w.word,
    pos: w.pos,
    meaning: w.meaning,
    example: w.example,
    day: w.day,
    source: 'base' as const,
    createdAt: now + i, // keeps the built-in order for new cards
    updatedAt: now,
  }));
}

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
  clearWrong: (id: string) => Promise<void>;
  saveSettings: (s: Partial<Settings>) => Promise<void>;
  exportBackup: () => string;
  importBackup: (json: string) => Promise<void>;
  resetProgress: () => Promise<void>;
  syncStatus: SyncStatus;
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
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ on: false, busy: false, telegram: false });
  const syncing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const reload = useCallback(async () => {
    const d = await store.loadAll();
    let list = d.entries;
    if (!d.seeded) {
      list = baseEntries();
      await store.putEntries(list);
      await store.setKv('seeded', true);
    }
    setEntries(list.sort((a, b) => a.createdAt - b.createdAt));
    setCards(new Map(d.cards.map((c) => [c.id, c])));
    setLogs(d.logs.sort((a, b) => a.reviewedAt - b.reviewedAt));
    setSettings({ ...DEFAULT_SETTINGS, ...(d.settings ?? {}) });
    setClearedWrong((await store.getKv<Record<string, number>>('clearedWrong')) ?? {});
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
    () => JSON.stringify({ app: 'toeic-vocab', version: 2, exportedAt: new Date().toISOString(), entries, cards: [...cards.values()], logs, settings: { ...settings, geminiKey: '' }, clearedWrong }),
    [entries, cards, logs, settings, clearedWrong]
  );

  const importBackup = useCallback(async (json: string) => {
    const d = JSON.parse(json);
    if (d?.app !== 'toeic-vocab' || !Array.isArray(d.entries)) throw new Error('이 앱의 백업 파일이 아닙니다.');
    const s: Settings = { ...DEFAULT_SETTINGS, ...(d.settings ?? {}), geminiKey: settings.geminiKey };
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
  }, [settings.geminiKey, queueSync]);

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

  const stopSync = useCallback(async () => {
    await sync.disconnect();
    setSyncStatus({ on: false, busy: false, telegram: false });
  }, []);

  const value: Ctx = {
    ready, entries, cards, logs, settings, ...derived, isMastered,
    grade, addEntries, removeEntry, clearWrong, saveSettings, exportBackup, importBackup, resetProgress,
    syncStatus, syncNow, startSync, stopSync,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
