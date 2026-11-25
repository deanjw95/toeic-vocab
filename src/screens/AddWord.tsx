import { useState } from 'react';
import type { Go } from '../App';
import { useVocab } from '../lib/store';
import { Icon } from '../ui';

/** Words are entered by hand: the meaning the learner wrote down sticks better. Examples are optional;
 *  missing ones are filled later by the Mac example agent (see mac/README). */
export default function AddWord({ go }: { go: Go }) {
  const { entries, addEntries, syncStatus } = useVocab();
  const [word, setWord] = useState('');
  const [m, setM] = useState({ pos: '', meaning: '', example: '' });
  const [saved, setSaved] = useState('');

  const dup = word.trim() ? entries.filter((e) => e.word.toLowerCase() === word.trim().toLowerCase()) : [];

  const save = async () => {
    if (!word.trim() || !m.meaning.trim()) return;
    await addEntries([{ word: word.trim(), pos: m.pos.trim(), meaning: m.meaning.trim(), example: m.example.trim(), day: 0, source: 'user' }]);
    setSaved(`${word.trim()}를 내 단어에 넣었어요.${m.example.trim() ? '' : ' 예문은 Mac에서 채워져요.'}`);
    setWord('');
    setM({ pos: '', meaning: '', example: '' });
    document.getElementById('word')?.focus();
  };

  return (
    <main className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="뒤로" onClick={() => go({ name: 'words', filter: 'my' })}><Icon name="back" /></button>
        <h1 className="h1 grow" style={{ fontSize: 20 }}>단어 추가</h1>
      </div>

      <form style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="field">
          <label htmlFor="word">영단어</label>
          <input id="word" className="input en" value={word} onChange={(e) => { setWord(e.target.value); setSaved(''); }} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="예: commission" autoFocus />
          {dup.length > 0 && <span className="note">이미 단어장에 있어요: {dup.map((d) => d.meaning).join(' / ')}. 다른 뜻이면 따로 저장하세요.</span>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <div className="field" style={{ width: 96 }}><label htmlFor="pos">품사</label><input id="pos" className="input" placeholder="n." value={m.pos} onChange={(e) => setM({ ...m, pos: e.target.value })} /></div>
          <div className="field grow"><label htmlFor="meaning">뜻</label><input id="meaning" className="input" placeholder="수수료" value={m.meaning} onChange={(e) => setM({ ...m, meaning: e.target.value })} /></div>
        </div>
        <div className="field">
          <label htmlFor="example">예문 (선택)</label>
          <textarea id="example" className="input en" style={{ fontSize: 17 }} rows={2} value={m.example} onChange={(e) => setM({ ...m, example: e.target.value })} />
          <span className="note">
            {syncStatus.on
              ? '비워 두면 Mac의 Claude Code가 내가 쓴 뜻에 맞는 토익 예문과 해석을 채워 줘요.'
              : '비워 두면 나중에 Mac에서 예문을 채울 수 있어요. 설정에서 기기 동기화를 먼저 켜 주세요.'}
          </span>
        </div>
        {saved && <div className="result right" role="status"><b>저장했어요</b><span>{saved}</span></div>}
        <button type="submit" className="btn" disabled={!word.trim() || !m.meaning.trim()}>저장</button>
      </form>
      <p className="note" style={{ margin: 0 }}>뜻이 여러 개면 뜻마다 따로 저장하세요. 뜻 하나가 카드 하나가 돼요.</p>
    </main>
  );
}
