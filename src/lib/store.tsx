import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BASE_WORDS } from './baseWords';
import * as store from './db';
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

  useEffect(() => {
    (async () => {
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
      setReady(true);
    })();
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
      const next = gradeCard(settings.retention, id, cards.get(id), g, t);
      const log: ReviewLogRecord = { id: uid(), entryId: id, grade: g, reviewedAt: t.getTime(), durationMs, mode };
      setCards((m) => new Map(m).set(id, next));
      setLogs((l) => [...l, log]);
      setNow(t.getTime());
      await Promise.all([store.putCard(next), store.addLog(log)]);
      return next;
    },
    [cards, settings.retention]
  );

  const addEntries = useCallback<Ctx['addEntries']>(async (list) => {
    const t = Date.now();
    const full: Entry[] = list.map((e, i) => ({ ...e, id: `u:${uid()}`, createdAt: t + i, updatedAt: t }));
    setEntries((x) => [...x, ...full]);
    await store.putEntries(full);
  }, []);

  const removeEntry = useCallback(async (id: string) => {
    setEntries((x) => x.filter((e) => e.id !== id));
    setCards((m) => {
      const n = new Map(m);
      n.delete(id);
      return n;
    });
    await store.deleteEntry(id);
  }, []);

  const clearWrong = useCallback(async (id: string) => {
    const next = { ...clearedWrong, [id]: Date.now() };
    setClearedWrong(next);
    await store.setKv('clearedWrong', next);
  }, [clearedWrong]);

  const saveSettings = useCallback(async (s: Partial<Settings>) => {
    const next = { ...settings, ...s };
    setSettings(next);
    await store.setKv('settings', next);
  }, [settings]);

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
  }, [settings.geminiKey]);

  const resetProgress = useCallback(async () => {
    await store.clearProgress();
    await store.setKv('clearedWrong', {});
    setCards(new Map());
    setLogs([]);
    setClearedWrong({});
  }, []);

  const value: Ctx = {
    ready, entries, cards, logs, settings, ...derived, isMastered,
    grade, addEntries, removeEntry, clearWrong, saveSettings, exportBackup, importBackup, resetProgress,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
