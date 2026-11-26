import type { Card } from 'ts-fsrs';

/** One study item: a single meaning of a word. A word with three meanings is three entries. */
export interface Entry {
  id: string;
  word: string;
  pos: string;
  meaning: string;
  example: string;
  exampleKo?: string;
  /** 1..10 for the built-in days, 0 for words the user added. */
  day: number;
  source: 'base' | 'user' | 'ai';
  /** Times the learner tried to add this word again with a meaning already saved, i.e. had forgotten it. */
  encounters?: number;
  createdAt: number;
  updatedAt: number;
}

/** FSRS card state for one entry, stored with dates as epoch ms. */
export interface CardRecord {
  id: string; // same as Entry.id
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
  /** When this record last changed (review or sync), for newest-wins sync. */
  updatedAt?: number;
}

export type Grade = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

/** Append-only review history. Kept so the schedule can be replayed or the FSRS weights refit later. */
export interface ReviewLogRecord {
  id: string;
  entryId: string;
  grade: Grade;
  reviewedAt: number;
  durationMs: number;
  mode: 'card' | 'choice' | 'typing' | 'readd';
}

export interface Settings {
  newPerDay: number;
  retention: number; // 0.85 .. 0.95
  quizLength: number;
  /** Pronunciation accent; TOEIC LC mixes US, UK, Australian and Canadian speakers. */
  accent: 'us' | 'uk' | 'au' | 'ca';
}

/** Shared with the Mac example agent through the 'settings/examples' sync row. */
export interface ExamplesStatus {
  requestedAt?: number;
  doneAt?: number;
  filled?: number;
  error?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 20,
  retention: 0.9,
  quizLength: 10,
  accent: 'us',
};

export type { Card };
