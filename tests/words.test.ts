import { describe, expect, it } from 'vitest';
import { checkDuplicate, compareMeaning, noKorean, onlyEnglishWord, onlyKorean } from '../src/lib/words';

describe('input filters', () => {
  it('keeps only English in the word field', () => {
    expect(onlyEnglishWord('comm수ission1')).toBe('commission');
    expect(onlyEnglishWord("take over / sb's")).toBe("take over  sb's");
  });
  it('keeps only Korean in the meaning field', () => {
    expect(onlyKorean('수수료 fee, 위원회(1)')).toBe('수수료 , 위원회(1)');
    expect(onlyKorean('ㅅㅜ')).toBe('ㅅㅜ'); // IME jamo while composing
  });
  it('drops Korean from the example sentence', () => {
    expect(noKorean('It costs $5, 5달러.')).toBe('It costs $5, 5.');
  });
});

describe('duplicates', () => {
  const list = [{ word: 'Commission', meaning: '수수료' }, { word: 'commission', meaning: '위원회' }];
  it('compares meanings', () => {
    expect(compareMeaning('수수료', ' 수수료 ')).toBe('same');
    expect(compareMeaning('수수료', '수수료, 커미션')).toBe('similar');
    expect(compareMeaning('위원회', '의뢰하다')).toBe('different');
  });
  it('classifies a new entry against saved ones', () => {
    expect(checkDuplicate(list, 'agenda', '안건').kind).toBe('new');
    expect(checkDuplicate(list, 'commission', '수수료').kind).toBe('same');
    expect(checkDuplicate(list, 'commission', '판매 수수료').kind).toBe('similar');
    const r = checkDuplicate(list, 'commission', '의뢰하다');
    expect(r.kind).toBe('other-meaning');
    expect(r.matches).toHaveLength(2);
  });
});

describe('one card per word', () => {
  it('merges meanings and parts of speech', async () => {
    const { mergeMeaning, mergePos } = await import('../src/lib/words');
    expect(mergeMeaning('수수료', '위원회')).toBe('수수료, 위원회');
    expect(mergeMeaning('수수료, 위원회', '판매 수수료')).toBe('수수료, 위원회');
    expect(mergePos('n.', 'v.')).toBe('n. / v.');
    expect(mergePos('n. / v.', 'n.')).toBe('n. / v.');
  });
  it('folds existing duplicates into the oldest entry', async () => {
    const { mergeSameWords } = await import('../src/lib/words');
    const base = { example: '', updatedAt: 0 };
    const r = mergeSameWords([
      { ...base, id: 'a', word: 'commission', pos: 'n.', meaning: '수수료', createdAt: 1 },
      { ...base, id: 'b', word: 'Commission', pos: 'n.', meaning: '위원회', createdAt: 2, example: 'The commission met.' },
      { ...base, id: 'c', word: 'commission', pos: '', meaning: '수수료', createdAt: 3 },
      { ...base, id: 'd', word: 'agenda', pos: 'n.', meaning: '안건', createdAt: 4 },
    ], 9);
    expect(r.keep).toHaveLength(1);
    expect(r.keep[0]).toMatchObject({ id: 'a', meaning: '수수료, 위원회', example: 'The commission met.', encounters: 1, updatedAt: 9 });
    expect(r.drop).toEqual([{ id: 'b', into: 'a' }, { id: 'c', into: 'a' }]);
  });
});
