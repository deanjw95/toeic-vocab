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
