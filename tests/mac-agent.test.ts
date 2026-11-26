import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS module for the Mac agent
import { buildPrompt, checkKey, entriesToProcess, filledRows, latestRows, missingExamples, parseClaudeOutput, shouldRun } from '../mac/lib.mjs';
import { checkKey as appCheckKey, needsAgent } from '../src/lib/words';

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
      { id: 'a', example: 'The agenda is ready.', exampleKo: '안건이 준비됐다.', pos: 'n.', wordFix: '', meaningFix: '' },
      { id: 'b', example: '', exampleKo: '빈 예문', pos: 'n.', wordFix: '', meaningFix: '' },
      { id: 'zzz', example: 'x', exampleKo: 'y', pos: 'n.', wordFix: '', meaningFix: '' },
      { id: 'a', example: 'dup', exampleKo: 'dup', pos: 'n.', wordFix: '', meaningFix: '' },
    ], 99);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'entry', id: 'a', updated_at: 99, data: { example: 'The agenda is ready.', pos: 'n.', checkedFor: 'agenda|안건', updatedAt: 99, meaning: '안건' } });
    expect(rows[0].data.check).toBeUndefined();
  });

  it('fills part of speech, keeps the learner example and word, and stores spelling suggestions', () => {
    const e = { id: 'r', word: 'recieve', meaning: '받다', pos: '', example: 'We recieve orders daily.', exampleKo: '주문을 받는다.' };
    const [row] = filledRows([e], [{ id: 'r', example: 'other', exampleKo: 'other', pos: 'v.', wordFix: 'receive', meaningFix: '' }], 5);
    expect(row.data).toMatchObject({ word: 'recieve', pos: 'v.', example: 'We recieve orders daily.', check: { word: 'receive' }, checkedFor: 'recieve|받다' });
    const [m] = filledRows([{ id: 'm', word: 'fee', meaning: '수수로', pos: 'n.', example: '' }],
      [{ id: 'm', example: 'The fee is low.', exampleKo: '수수료가 낮다.', pos: 'adj.', wordFix: 'Fee', meaningFix: '수수료' }], 5);
    expect(m.data.pos).toBe('n.'); // learner's choice wins
    expect(m.data.check).toEqual({ meaning: '수수료' }); // case-only word change ignored
  });

  it('picks words without example, part of speech or a current spelling check', () => {
    const ok = { id: 'ok', word: 'bid', meaning: '입찰', pos: 'n.', example: 'x', checkedFor: 'bid|입찰', createdAt: 1 };
    const rows = latestRows([
      { kind: 'entry', id: 'ok', data: ok },
      { kind: 'entry', id: 'nopos', data: { ...ok, id: 'nopos', pos: '', createdAt: 2 } },
      { kind: 'entry', id: 'edited', data: { ...ok, id: 'edited', meaning: '입찰하다', createdAt: 3 } },
      { kind: 'entry', id: 'noex', data: { ...ok, id: 'noex', example: '', createdAt: 4 } },
    ]);
    expect(entriesToProcess(rows).map((e: { id: string }) => e.id)).toEqual(['nopos', 'edited', 'noex']);
    expect(needsAgent(ok)).toBe(false);
    expect(needsAgent({ ...ok, meaning: '입찰하다' })).toBe(true);
    expect(appCheckKey(ok)).toBe(checkKey(ok));
  });
});
