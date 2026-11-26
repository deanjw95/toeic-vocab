import { useState, type ChangeEvent } from 'react';
import type { Go } from '../App';
import { useVocab } from '../lib/store';
import { checkDuplicate, noKorean, onlyEnglishWord, onlyKorean, POS } from '../lib/words';
import { Icon } from '../ui';

/** Words are entered by hand: the meaning the learner wrote down sticks better. Examples are optional;
 *  missing ones are filled later by the Mac example agent (see mac/README). */
export default function AddWord({ go }: { go: Go }) {
  const { entries, addEntries, syncStatus } = useVocab();
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
  const blocked = dup.kind === 'same';
  const canSave = !!word.trim() && !!meaning.trim() && !blocked;

  const save = async () => {
    if (!canSave) return;
    const w = word.trim().replace(/\s+/g, ' ');
    await addEntries([{ word: w, pos, meaning: meaning.trim(), example: example.trim(), day: 0, source: 'user' }]);
    const other = dup.kind === 'other-meaning' ? ' 뜻이 달라서 새 카드로 넣었어요.' : '';
    setSaved(`${w} (${meaning.trim()})를 저장했어요.${other}${example.trim() ? '' : ' 예문은 Mac에서 채워져요.'}`);
    setWord(''); setPos(''); setMeaning(''); setExample(''); setHint(null);
    document.getElementById('word')?.focus();
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
          <label>품사</label>
          <div className="filters" role="group" aria-label="품사" style={{ flexWrap: 'wrap', overflow: 'visible' }}>
            {POS.map((p) => <button type="button" key={p} className="en" aria-pressed={pos === p} onClick={() => setPos(pos === p ? '' : p)}>{p}</button>)}
          </div>
        </div>

        <div className="field">
          <label htmlFor="meaning">뜻</label>
          <input id="meaning" lang="ko" className="input" value={meaning} onChange={filtered('meaning', onlyKorean, setMeaning, '뜻 칸에는 한국어만 들어가요. 키보드를 한글로 바꿔 주세요.')}
            autoComplete="off" placeholder="예: 수수료" />
          {hint?.field === 'meaning' && <span className="note" style={{ color: 'var(--again)' }}>{hint.text}</span>}
          {dup.kind === 'same' && (
            <div className="error" role="status">이미 같은 뜻으로 저장돼 있어요: {dup.matches.map((d) => d.meaning).join(' / ')}</div>
          )}
          {dup.kind === 'similar' && (
            <div className="result" style={{ background: 'var(--hard-tint)', color: 'var(--hard)' }} role="status">
              <b>비슷한 뜻이 있어요</b>
              <span>{dup.matches.map((d) => d.meaning).join(' / ')}. 다른 뜻이 맞으면 그대로 저장하세요.</span>
            </div>
          )}
          {dup.kind === 'other-meaning' && (
            <span className="note">
              이미 있는 뜻: {dup.matches.map((d) => d.meaning).join(' / ')}. {meaning.trim() ? '뜻이 달라서 새 카드로 추가돼요.' : '다른 뜻이면 새 카드로 추가돼요.'}
            </span>
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
        <button type="submit" className="btn" disabled={!canSave}>{dup.kind === 'similar' ? '그래도 저장' : '저장'}</button>
      </form>
      <p className="note" style={{ margin: 0 }}>뜻이 여러 개면 뜻마다 따로 저장하세요. 뜻 하나가 카드 하나가 돼요.</p>
    </main>
  );
}
