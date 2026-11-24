import { describe, expect, it } from 'vitest';
import { findInSentence, gradeTyped } from '../src/lib/quiz';
import { buildPrompt } from '../src/lib/ai';
import { formatInterval, gradeCard, previewDue } from '../src/lib/srs';
import { BASE_WORDS } from '../src/lib/baseWords';

describe('gradeTyped', () => {
  it('accepts exact answers ignoring case and spaces', () => {
    expect(gradeTyped(' Expedite ', 'expedite')).toBe('right');
  });
  it('treats one wrong letter as close', () => {
    expect(gradeTyped('expidite', 'expedite')).toBe('close');
    expect(gradeTyped('expedit', 'expedite')).toBe('close');
  });
  it('rejects other answers and empty input', () => {
    expect(gradeTyped('expire', 'expedite')).toBe('wrong');
    expect(gradeTyped('', 'expedite')).toBe('wrong');
    expect(gradeTyped('ad', 'at')).toBe('wrong'); // short words need an exact match
  });
});

describe('findInSentence', () => {
  it('finds inflected forms', () => {
    expect(findInSentence('The city commissioned a sculpture.', 'commission')?.form).toBe('commissioned');
    expect(findInSentence('The meeting was adjourned at noon.', 'adjourn')?.form).toBe('adjourned');
    expect(findInSentence('Can you expedite the delivery?', 'expedite')?.form).toBe('expedite');
  });
  it('finds phrases', () => {
    expect(findInSentence('That item is currently out of stock.', 'out of stock')?.form).toBe('out of stock');
  });
  it('returns null when absent', () => {
    expect(findInSentence('Nothing here.', 'agenda')).toBeNull();
  });
  it('locates most built-in words in their own example', () => {
    const missing = BASE_WORDS.filter((w) => !findInSentence(w.example, w.word)).map((w) => w.word);
    expect(missing.length).toBeLessThan(10);
  });
});

describe('srs', () => {
  it('orders the four button intervals', () => {
    const p = previewDue(0.9, undefined, new Date('2026-11-24T00:00:00Z'));
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
  });
  it('round-trips a graded card', () => {
    const c = gradeCard(0.9, 'x', undefined, 3, new Date('2026-11-24T00:00:00Z'));
    expect(c.reps).toBe(1);
    const c2 = gradeCard(0.9, 'x', c, 1, new Date(c.due));
    expect(c2.reps).toBe(2);
  });
  it('formats intervals in Korean units', () => {
    expect(formatInterval(10 * 60_000)).toBe('10분');
    expect(formatInterval(5 * 86_400_000)).toBe('5일');
  });
});

it('prompt names the word and asks for JSON', () => {
  expect(buildPrompt('commission')).toContain('"commission"');
});
