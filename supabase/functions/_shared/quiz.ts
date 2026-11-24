// Server copies of the app's FSRS and quiz helpers (src/lib/srs.ts, src/lib/quiz.ts).
import { createEmptyCard, fsrs, generatorParameters, type Card, type State } from 'npm:ts-fsrs@6';
import type { CardRecord, Entry } from './common.ts';

export function gradeCard(retention: number, id: string, r: CardRecord | undefined, grade: 1 | 2 | 3 | 4, now = new Date()): CardRecord {
  const f = fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }));
  const card: Card = r
    ? {
        due: new Date(r.due),
        stability: r.stability,
        difficulty: r.difficulty,
        scheduled_days: r.scheduled_days,
        learning_steps: r.learning_steps,
        reps: r.reps,
        lapses: r.lapses,
        state: r.state as State,
        last_review: r.last_review ? new Date(r.last_review) : undefined,
      }
    : createEmptyCard(now);
  const c = f.next(card, now, grade).card;
  return {
    id,
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review?.getTime(),
  };
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}분`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간`;
  const d = Math.round(ms / 86_400_000);
  if (d < 30) return `${d}일`;
  if (d < 365) return `${Math.round(d / 30)}개월`;
  return `${(d / 365).toFixed(1)}년`;
}

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

/** Four meanings, one correct; same part of speech preferred. Returns options and the correct index. */
export function buildChoices(target: Entry, pool: Entry[]): { options: string[]; correct: number } {
  const seen = new Set([target.meaning]);
  const others = pool.filter((e) => e.word !== target.word && !seen.has(e.meaning));
  const same = shuffle(others.filter((e) => e.pos === target.pos));
  const rest = shuffle(others.filter((e) => e.pos !== target.pos));
  const picks: string[] = [];
  for (const e of [...same, ...rest]) {
    if (picks.length === 3) break;
    if (seen.has(e.meaning)) continue;
    seen.add(e.meaning);
    picks.push(e.meaning);
  }
  const options = shuffle([target.meaning, ...picks]);
  return { options, correct: options.indexOf(target.meaning) };
}
