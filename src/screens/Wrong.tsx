import type { Go } from '../App';
import { useVocab } from '../lib/store';
import { Icon, speak } from '../ui';

export default function Wrong({ go }: { go: Go }) {
  const { wrong, clearWrong } = useVocab();
  const list = wrong.map((w) => w.entry);
  return (
    <main className="page with-tabs">
      <h1 className="h1">오답노트</h1>
      {!wrong.length ? (
        <div className="card empty">아직 틀린 단어가 없어요.<br />학습에서 "다시"를 누르거나 퀴즈에서 틀리면 여기에 모여요.</div>
      ) : (
        <>
          <p className="muted small" style={{ margin: 0 }}>틀린 단어 {wrong.length}개, 많이 틀린 순이에요. 다 외운 단어는 체크해서 빼세요.</p>
          <div className="tiles">
            <button className="btn soft" onClick={() => go({ name: 'study', entries: list, title: '오답 복습' })}>카드로 복습</button>
            <button className="btn" onClick={() => go({ name: 'quiz', entries: list, title: '오답 퀴즈' })}>오답 퀴즈</button>
          </div>
          <div className="list">
            {wrong.map(({ entry: e, misses, leech }) => (
              <div className="item" key={e.id}>
                <button className="icon-btn" style={{ background: 'none', width: 36 }} aria-label={`${e.word} 발음 듣기`} onClick={() => speak(e.word)}><Icon name="sound" size={18} color="var(--muted)" /></button>
                <div className="grow">
                  <div className="w">{e.word} <span className="en muted" style={{ fontStyle: 'italic', fontWeight: 400, fontSize: 15 }}>{e.pos}</span></div>
                  <div className="m">{e.meaning}</div>
                </div>
                {leech && <span className="pill leech">고질</span>}
                <span className="pill leech" style={{ background: 'none' }}>{misses}회</span>
                <button className="icon-btn" style={{ background: 'var(--surface-2)' }} aria-label={`${e.word} 오답노트에서 빼기`} onClick={() => clearWrong(e.id)}><Icon name="check" size={18} /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
