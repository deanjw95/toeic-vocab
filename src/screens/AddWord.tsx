import { useState, type ChangeEvent } from 'react';
import type { Go } from '../App';
import { useVocab } from '../lib/store';
import { checkDuplicate, mergeMeaning, mergePos, noKorean, onlyEnglishWord, onlyKorean, POS } from '../lib/words';
import { Icon } from '../ui';

/** Words are entered by hand: the meaning the learner wrote down sticks better. Examples are optional;
 *  missing ones are filled later by the Mac example agent (see mac/README). */
export default function AddWord({ go }: { go: Go }) {
  const { entries, cards, addEntries, updateEntry, reencounter, syncStatus } = useVocab();
  const [word, setWord] = useState('');
  const [pos, setPos] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [saved, setSaved] = useState('');
  const [hint, setHint] = useState<{ field: string; text: string } | null>(null);

  /** Browsers can't switch the keyboard language, so wrong-script characters are dropped with a hint. */
  const filtered = (field: string, clean: (s: string) => string, set: (s: string) => void, text: string) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const v = e.target.value;
      const c = clean(v);
      set(c);
      setSaved('');
      if (c !== v) setHint({ field, text });
      else if (hint?.field === field) setHint(null);
    };

  const dup = checkDuplicate(entries, word, meaning);
  const existing = dup.matches[0]; // one card per word, so at most one
  // new: brand-new word · known: meaning already on the card (forgot it) · add: new meaning for a saved word
  const mode = !existing ? 'new' : !meaning.trim() || dup.kind === 'same' || dup.kind === 'similar' ? 'known' : 'add';
  const canSave = !!word.trim() && (mode === 'known' || !!meaning.trim());

  const reset = (msg: string) => {
    setSaved(msg);
    setWord(''); setPos(''); setMeaning(''); setExample(''); setHint(null);
    document.getElementById('word')?.focus();
  };

  const save = async () => {
    if (!canSave) return;
    const w = word.trim().replace(/\s+/g, ' ');
    if (mode === 'new') {
      await addEntries([{ word: w, pos, meaning: meaning.trim(), example: example.trim(), day: 0, source: 'user' }]);
      reset(`${w} (${meaning.trim()})를 저장했어요.${example.trim() ? '' : ' 예문은 Mac에서 채워져요.'}`);
    } else if (mode === 'known') {
      const studied = cards.has(existing.id);
      await reencounter(existing.id);
      reset(`${existing.word}: 또 만난 횟수 ${(existing.encounters ?? 0) + 1}번.${studied ? ' 복습 카드로 다시 넣었어요.' : ''}`);
    } else {
      const m = mergeMeaning(existing.meaning, meaning);
      await updateEntry(existing.id, {
        meaning: m,
        pos: mergePos(existing.pos, pos),
        ...(example.trim() && !existing.example?.trim() ? { example: example.trim(), exampleKo: undefined } : {}),
      });
      reset(`${existing.word} 카드에 뜻을 더했어요: ${m}`);
    }
  };

  return (
    <main className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="뒤로" onClick={() => go({ name: 'words' })}><Icon name="back" /></button>
        <h1 className="h1 grow" style={{ fontSize: 20 }}>단어 추가</h1>
      </div>

      <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="field">
          <label htmlFor="word">영단어</label>
          <input id="word" lang="en" className="input en" value={word} onChange={filtered('word', onlyEnglishWord, setWord, '영단어 칸에는 영어만 들어가요. 키보드를 영어로 바꿔 주세요.')}
            autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="예: commission" autoFocus />
          {hint?.field === 'word' && <span className="note" style={{ color: 'var(--again)' }}>{hint.text}</span>}
        </div>

        <div className="field">
          <label>품사 <span className="muted" style={{ fontWeight: 400 }}>(선택, 비워 두면 Mac이 채워요)</span></label>
          <div className="filters" role="group" aria-label="품사" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
            {POS.map((p) => <button type="button" key={p} className="en" aria-pressed={pos === p} onClick={() => setPos(pos === p ? '' : p)}>{p}</button>)}
          </div>
        </div>

        <div className="field">
          <label htmlFor="meaning">뜻</label>
          <input id="meaning" lang="ko" className="input" value={meaning} onChange={filtered('meaning', onlyKorean, setMeaning, '뜻 칸에는 한국어만 들어가요. 키보드를 한글로 바꿔 주세요.')}
            autoComplete="off" placeholder="예: 수수료" />
          {hint?.field === 'meaning' && <span className="note" style={{ color: 'var(--again)' }}>{hint.text}</span>}
          {mode === 'known' && (
            <div className="result" style={{ background: 'var(--hard-tint)', color: 'var(--hard)' }} role="status">
              <b>이미 있는 단어예요{existing.encounters ? ` · 또 만남 ${existing.encounters}번` : ''}</b>
              <span>{existing.meaning}. {meaning.trim() ? '같은 뜻이라 ' : ''}저장하면 또 만난 횟수를 올리고 복습 카드로 다시 넣어요.</span>
            </div>
          )}
          {mode === 'add' && (
            <span className="note">이미 있는 뜻: {existing.meaning}. 뜻이 달라서 같은 카드에 뜻을 더해요.</span>
          )}
        </div>

        <div className="field">
          <label htmlFor="example">예문 (선택)</label>
          <textarea id="example" lang="en" className="input en" style={{ fontSize: 17 }} rows={2} value={example}
            onChange={filtered('example', noKorean, setExample, '예문은 영어로 써 주세요.')} autoCapitalize="sentences" />
          {hint?.field === 'example' && <span className="note" style={{ color: 'var(--again)' }}>{hint.text}</span>}
          <span className="note">
            {syncStatus.on
              ? '비워 두면 Mac의 Claude Code가 내가 쓴 뜻에 맞는 토익 예문과 해석을 채워 줘요.'
              : '비워 두면 나중에 Mac에서 예문을 채울 수 있어요. 설정에서 기기 동기화를 먼저 켜 주세요.'}
          </span>
        </div>

        {saved && <div className="result right" role="status"><b>저장했어요</b><span>{saved}</span></div>}
        <button type="submit" className="btn" disabled={!canSave}>{mode === 'known' ? '또 만남 +1' : mode === 'add' ? '뜻 추가' : '저장'}</button>
      </form>
      <p className="note" style={{ margin: 0 }}>한 단어는 카드 하나예요. 다른 뜻을 넣으면 그 카드에 뜻이 더해지고, 이미 있는 뜻을 넣으면 또 만난 횟수가 올라가요.</p>
    </main>
  );
}
