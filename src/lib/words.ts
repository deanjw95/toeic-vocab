// Input rules and duplicate checks for adding words by hand.

/** English word or phrase: letters, spaces, hyphen, apostrophe, period. */
export const onlyEnglishWord = (s: string) => s.replace(/[^A-Za-z\s'’\-.]/g, '');
/** English sentence: anything except Korean. */
export const noKorean = (s: string) => s.replace(/[ᄀ-ᇿ㄰-㆏가-힯]/g, '');
/** Korean meaning: Hangul, digits, spaces and light punctuation, no Latin letters. */
export const onlyKorean = (s: string) => s.replace(/[^ᄀ-ᇿ㄰-㆏가-힯0-9\s,./()~·;:\-?!'"…]/g, '');

const norm = (s: string) => s.replace(/[\s,./()~·;:\-?!'"…]/g, '');
const parts = (s: string) => s.split(/[,/;·]/).map(norm).filter(Boolean);

export type MeaningMatch = 'same' | 'similar' | 'different';

/** same: identical apart from spacing/punctuation. similar: one sense overlaps (e.g. "수수료" vs "수수료, 커미션"). */
export function compareMeaning(a: string, b: string): MeaningMatch {
  if (norm(a) === norm(b)) return 'same';
  const pa = parts(a), pb = parts(b);
  for (const x of pa) for (const y of pb) {
    if (x === y) return 'similar';
    if (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x))) return 'similar';
  }
  return 'different';
}

export interface DupCheck<T> {
  kind: 'new' | 'other-meaning' | 'similar' | 'same';
  matches: T[];
}

/** How a new (word, meaning) relates to what is already saved. */
export function checkDuplicate<T extends { word: string; meaning: string }>(list: T[], word: string, meaning: string): DupCheck<T> {
  const w = word.trim().toLowerCase();
  const same = list.filter((e) => e.word.trim().toLowerCase() === w);
  if (!w || !same.length) return { kind: 'new', matches: [] };
  if (!meaning.trim()) return { kind: 'other-meaning', matches: same };
  const r = same.map((e) => ({ e, m: compareMeaning(e.meaning, meaning) }));
  const exact = r.filter((x) => x.m === 'same').map((x) => x.e);
  if (exact.length) return { kind: 'same', matches: exact };
  const close = r.filter((x) => x.m === 'similar').map((x) => x.e);
  if (close.length) return { kind: 'similar', matches: close };
  return { kind: 'other-meaning', matches: same };
}

export const POS = ['n.', 'v.', 'adj.', 'adv.', 'prep.', 'conj.', 'phr.'];

/** "수수료" + "위원회" → "수수료, 위원회" (one card per word, meanings joined). */
export function mergeMeaning(old: string, add: string) {
  const a = old.trim(), b = add.trim();
  if (!a) return b;
  if (!b || compareMeaning(a, b) !== 'different') return a;
  return `${a}, ${b}`;
}

/** "n." + "v." → "n. / v." */
export function mergePos(old: string, add: string) {
  const list = [...old.split('/'), ...add.split('/')].map((s) => s.trim()).filter(Boolean);
  return [...new Set(list)].join(' / ');
}

interface Mergeable { id: string; word: string; pos: string; meaning: string; example: string; exampleKo?: string; encounters?: number; createdAt: number; updatedAt: number }

/** Folds entries that share a word into the oldest one. Returns the merged keepers and the ids to drop. */
export function mergeSameWords<T extends Mergeable>(entries: T[], now: number) {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const k = e.word.trim().toLowerCase();
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const keep: T[] = [];
  const drop: { id: string; into: string }[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => a.createdAt - b.createdAt);
    const [first, ...rest] = g;
    const merged = rest.reduce<T>((acc, e) => ({
      ...acc,
      pos: mergePos(acc.pos, e.pos),
      meaning: mergeMeaning(acc.meaning, e.meaning),
      example: acc.example?.trim() ? acc.example : e.example,
      exampleKo: acc.example?.trim() ? acc.exampleKo : e.exampleKo,
      encounters: (acc.encounters ?? 0) + (e.encounters ?? 0) + (compareMeaning(acc.meaning, e.meaning) === 'different' ? 0 : 1),
    }), first);
    keep.push({ ...merged, updatedAt: now });
    for (const e of rest) drop.push({ id: e.id, into: first.id });
  }
  return { keep, drop };
}
