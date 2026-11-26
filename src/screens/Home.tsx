import type { Go } from '../App';
import { useVocab } from '../lib/store';
import { Icon } from '../ui';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function Home({ go }: { go: Go }) {
  const { entries, cards, dueEntries, newEntriesToday, wrong, streak, isMastered } = useVocab();
  const todayList = [...dueEntries, ...newEntriesToday];
  const minutes = Math.max(1, Math.round(todayList.length * 0.25));
  const d = new Date();
  const leeches = wrong.filter((w) => w.leech).length;

  const studied = entries.filter((e) => cards.has(e.id));
  const quizPool = studied.length >= 4 ? studied : entries;
  const mastered = entries.filter((e) => isMastered(e.id)).length;

  return (
    <main className="page with-tabs">
      <div className="row">
        <div className="grow">
          <div className="small muted">{d.getMonth() + 1}월 {d.getDate()}일 {WEEKDAYS[d.getDay()]}요일</div>
          <h1 className="h1">오늘도 한 장씩</h1>
        </div>
        {streak > 0 && (
          <span className="chip" aria-label={`${streak}일 연속 학습`}>
            <Icon name="flame" size={16} color="#E8590C" />
            {streak}일 연속
          </span>
        )}
      </div>

      <section className="hero" aria-label="오늘의 학습">
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="label">오늘의 학습</span>
            <span className="big">{todayList.length}<span style={{ fontSize: 22, marginLeft: 4, fontFamily: 'var(--sans)' }}>장</span></span>
          </div>
          {todayList.length > 0 && <span className="pill" style={{ background: 'rgba(255,255,255,.1)', color: 'var(--hero-muted)' }}>약 {minutes}분</span>}
        </div>
        <div className="split">
          <div><span className="label">복습</span><b style={{ fontSize: 20 }}>{dueEntries.length}</b></div>
          <div><span className="label">새 단어</span><b style={{ fontSize: 20 }}>{newEntriesToday.length}</b></div>
        </div>
        <button className="btn" disabled={!todayList.length} onClick={() => go({ name: 'study', entries: todayList, title: '오늘의 학습' })}>
          {todayList.length ? <>카드로 학습 시작 <Icon name="arrowR" size={18} stroke={2.4} /></> : (entries.length ? '오늘 학습을 모두 마쳤어요' : '단어를 추가하면 시작돼요')}
        </button>
      </section>

      <div className="tiles">
        <button className="tile" disabled={entries.length < 4} onClick={() => go({ name: 'quiz', entries: quizPool, title: '퀴즈' })}>
          <span className="ic" style={{ background: 'var(--accent-tint)' }}><Icon name="grid" color="var(--accent-ink)" /></span>
          <span><b>퀴즈</b><span className="small muted">{entries.length < 4 ? '단어 4개부터 열려요' : '객관식, 주관식'}</span></span>
        </button>
        <button className="tile" onClick={() => go({ name: 'wrong' })}>
          <span className="ic" style={{ background: 'var(--again-tint)' }}><Icon name="alert" color="var(--again)" /></span>
          <span><b>오답노트</b><span className="small muted">{wrong.length ? `${wrong.length}개${leeches ? `, 고질 단어 ${leeches}개` : ''}` : '아직 없어요'}</span></span>
        </button>
      </div>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="row">
          <h2 className="h2 grow">내 단어장</h2>
          <button className="chip" style={{ border: 0 }} onClick={() => go({ name: 'add' })}><Icon name="plus" size={16} />단어 추가</button>
        </div>
        {entries.length === 0 ? (
          <button className="deck" style={{ alignItems: 'flex-start' }} onClick={() => go({ name: 'add' })}>
            <b style={{ fontSize: 16 }}>아직 단어가 없어요</b>
            <span className="small muted">공부하다 만난 단어를 내 뜻으로 적어 넣으면 여기서 카드가 돼요.</span>
          </button>
        ) : (
          <button className="deck" onClick={() => go({ name: 'words' })}>
            <span className="day">전체 {entries.length}개</span>
            <span className="bar"><i style={{ width: `${(studied.length / entries.length) * 100}%` }} /></span>
            <span className="small muted">{studied.length}/{entries.length} 학습{mastered ? `, ${mastered} 암기` : ''}</span>
          </button>
        )}
      </section>
    </main>
  );
}
