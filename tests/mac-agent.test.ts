import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module for the Mac agent
import { buildPrompt, filledRows, latestRows, missingExamples, parseClaudeOutput, shouldRun } from '../mac/lib.mjs';

const at = (h: number, m = 0) => new Date(2026, 10, 25, h, m).getTime();

describe('mac example agent', () => {
  it('runs on a new app request, else once a day from noon', () => {
    expect(shouldRun({}, { requestedAt: 5 }, at(9))).toBe('request');
    expect(shouldRun({ lastRequestHandled: 5 }, { requestedAt: 5 }, at(9))).toBe(null);
    expect(shouldRun({ lastRequestHandled: 5 }, { requestedAt: 5 }, at(12, 3))).toBe('daily');
    expect(shouldRun({ lastDailyDate: '2026-11-25' }, {}, at(15))).toBe(null);
    expect(shouldRun({ lastDailyDate: '2026-11-24' }, {}, at(23))).toBe('daily');
  });

  it('finds live entries without an example, using the latest version of each row', () => {
    const rows = latestRows([
      { kind: 'entry', id: 'a', data: { id: 'a', word: 'agenda', example: '', createdAt: 2 } },
      { kind: 'entry', id: 'b', data: { id: 'b', word: 'bid', example: 'We won the bid.', createdAt: 1 } },
      { kind: 'entry', id: 'c', data: { id: 'c', word: 'cater', example: '', createdAt: 1 } },
      { kind: 'entry', id: 'c', data: null }, // deleted later
      { kind: 'card', id: 'a', data: {} },
    ]);
    expect(missingExamples(rows).map((e: { id: string }) => e.id)).toEqual(['a']);
  });

  it('builds a prompt that carries the learner meaning', () => {
    const p = buildPrompt([{ id: 'u:1', word: 'commission', pos: 'n.', meaning: '수수료' }]);
    expect(p).toContain('"commission"');
    expect(p).toContain('수수료');
  });

  it('reads structured output and falls back to fenced JSON in result', () => {
    const items = [{ id: 'u:1', example: 'x', exampleKo: 'y' }];
    expect(parseClaudeOutput(JSON.stringify({ structured_output: { items } }))).toEqual(items);
    expect(parseClaudeOutput(JSON.stringify({ result: '```json\n' + JSON.stringify({ items }) + '\n```' }))).toEqual(items);
    expect(() => parseClaudeOutput(JSON.stringify({ is_error: true, result: 'not logged in' }))).toThrow('not logged in');
  });

  it('keeps only well-formed answers for ids it asked about', () => {
    const batch = [{ id: 'a', word: 'agenda', meaning: '안건', example: '' }, { id: 'b', word: 'bid', meaning: '입찰', example: '' }];
    const rows = filledRows(batch, [
      { id: 'a', example: 'The agenda is ready.', exampleKo: '안건이 준비됐다.' },
      { id: 'b', example: '', exampleKo: '빈 예문' },
      { id: 'zzz', example: 'x', exampleKo: 'y' },
      { id: 'a', example: 'dup', exampleKo: 'dup' },
    ], 99);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'entry', id: 'a', updated_at: 99, data: { example: 'The agenda is ready.', updatedAt: 99, meaning: '안건' } });
  });
});
