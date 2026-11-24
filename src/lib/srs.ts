import { createEmptyCard, fsrs, generatorParameters, type Card, type State } from 'ts-fsrs';
import type { CardRecord, Grade } from './types';

export const DAY_MS = 86_400_000;

export function scheduler(retention: number) {
  return fsrs(generatorParameters({ request_retention: retention, enable_fuzz: true }));
}

export function toCard(r: CardRecord | undefined, now: Date): Card {
  if (!r) return createEmptyCard(now);
  return {
    due: new Date(r.due),
    stability: r.stability,
    difficulty: r.difficulty,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state as State,
    last_review: r.last_review ? new Date(r.last_review) : undefined,
  };
}

export function fromCard(id: string, c: Card): CardRecord {
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

/** Next due time for each of the four buttons, for the labels under them. */
export function previewDue(retention: number, r: CardRecord | undefined, now = new Date()): Record<Grade, number> {
  const p = scheduler(retention).repeat(toCard(r, now), now);
  return { 1: p[1].card.due.getTime(), 2: p[2].card.due.getTime(), 3: p[3].card.due.getTime(), 4: p[4].card.due.getTime() };
}

export function gradeCard(retention: number, id: string, r: CardRecord | undefined, grade: Grade, now = new Date()): CardRecord {
  return fromCard(id, scheduler(retention).next(toCard(r, now), now, grade).card);
}

/** "10분", "3시간", "5일", "2개월" */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}분`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}시간`;
  const d = Math.round(ms / DAY_MS);
  if (d < 30) return `${d}일`;
  if (d < 365) return `${Math.round(d / 30)}개월`;
  return `${(d / 365).toFixed(1)}년`;
}

export const LEECH_LAPSES = 8;
export const MASTERED_DAYS = 21; // scheduled interval counted as "외웠음"

export function startOfDay(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
