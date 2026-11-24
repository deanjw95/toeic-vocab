import type { Entry } from './types';

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[’']/g, "'");

export type TypedResult = 'right' | 'close' | 'wrong';

/** Exact (ignoring case/spaces) = right; one letter off on a word of 4+ letters = close; else wrong. */
export function gradeTyped(input: string, answer: string): TypedResult {
  const a = norm(input), b = norm(answer).replace(/é/g, 'e');
  const a2 = a.replace(/é/g, 'e');
  if (!a) return 'wrong';
  if (a2 === b) return 'right';
  if (b.length >= 4 && editDistance(a2, b) === 1) return 'close';
  return 'wrong';
}

/**
 * Finds the word (or an inflected form of it) inside its example sentence so the quiz can blank it out.
 * Returns null when the sentence does not contain it.
 */
export function findInSentence(sentence: string, word: string): { start: number; end: number; form: string } | null {
  const w = word.toLowerCase();
  if (w.includes(' ')) {
    const i = sentence.toLowerCase().indexOf(w);
    return i < 0 ? null : { start: i, end: i + w.length, form: sentence.slice(i, i + w.length) };
  }
  // stem: drop a final e / y so "expedite" matches "expedited", "apply" matches "applied"
  const stem = w.length > 4 ? w.replace(/(e|y)$/, '') : w;
  const re = /[A-Za-zÀ-ÿ'-]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sentence))) {
    const tok = m[0].toLowerCase();
    if (tok === w || (tok.startsWith(stem) && tok.length - w.length <= 3)) {
      return { start: m.index, end: m.index + m[0].length, form: m[0] };
    }
  }
  return null;
}

/** Three wrong choices, preferring the same part of speech, never the same meaning or word. */
export function distractors(target: Entry, pool: Entry[], field: 'meaning' | 'word'): Entry[] {
  const others = pool.filter((e) => e.word.toLowerCase() !== target.word.toLowerCase() && e[field] !== target[field]);
  const samePos = shuffle(others.filter((e) => e.pos === target.pos));
  const rest = shuffle(others.filter((e) => e.pos !== target.pos));
  const seen = new Set<string>();
  const out: Entry[] = [];
  for (const e of [...samePos, ...rest]) {
    if (seen.has(e[field])) continue;
    seen.add(e[field]);
    out.push(e);
    if (out.length === 3) break;
  }
  return out;
}
