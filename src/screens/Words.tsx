import { useMemo, useState } from 'react';
import type { Go } from '../App';
import { DAY_TOPICS } from '../lib/baseWords';
import { formatInterval } from '../lib/srs';
import { useVocab } from '../lib/store';
import { Icon, speak } from '../ui';

export default function Words({ go, initialFilter = 'all' }: { go: Go; initialFilter?: string }) {
  const { entries, cards, isMastered, removeEntry } = useVocab();
  const [filter, setFilter] = useState(initialFilter);
  const [q, setQ] = useState('');
  const hasMine = entries.some((e) => e.day === 0);

  const filters = [
    { key: 'all', label: '전체' },
    ...DAY_TOPICS.map((t, i) => ({ key: String(i + 1), label: `Day ${i + 1}` })),
    ...(hasMine ? [{ key: 'my', label: '내 단어' }] : []),
  ];

  const list = useMemo(() => {
    let l = entries;
    if (filter === 'my') l = l.filter((e) => e.day === 0);
    else if (filter !== 'all') l = l.filter((e) => String(e.day) === filter);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((e) => e.word.toLowerCase().includes(s) || e.meaning.includes(q.trim()));
    return l;
  }, [entries, filter, q]);

  const title = filter === 'all' ? '전체' : filter === 'my' ? '내 단어' : `Day ${filter} ${DAY_TOPICS[Number(filter) - 1] ?? ''}`;
  const now = Date.now();

  return (
    <main className="page with-tabs">
      <div className="row">
        <h1 className="h1 grow">단어장</h1>
        <button className="chip" style={{ border: 0 }} onClick={() => go({ name: 'add' })}><Icon name="plus" size={16} />단어 추가</button>
      </div>
      <div className="filters" role="group" aria-label="Day 선택">
        {filters.map((f) => (
          <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="search" className="sr-only" style={{ position: 'absolute', left: -9999 }}>검색</label>
        <input id="search" className="input" type="search" placeholder="영단어나 뜻으로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {filter !== 'all' && list.length > 0 && (
        <div className="tiles">
          <button className="btn soft" onClick={() => go({ name: 'study', entries: list, title })}>카드로 학습</button>
          <button className="btn" onClick={() => go({ name: 'quiz', entries: list, title: `${title} 퀴즈` })}>퀴즈</button>
        </div>
      )}
      <div className="list">
        {list.length === 0 && <div className="empty">{q ? '검색 결과가 없어요.' : '단어가 없어요.'}</div>}
        {list.map((e) => {
          const c = cards.get(e.id);
          const tag = !c ? null : isMastered(e.id) ? <span className="pill good">암기</span> : <span className="pill">{c.due <= now ? '복습할 때' : formatInterval(c.due - now) + ' 뒤'}</span>;
          return (
            <div className="item" key={e.id}>
              <button className="icon-btn" style={{ background: 'none', width: 36 }} aria-label={`${e.word} 발음 듣기`} onClick={() => speak(e.word)}><Icon name="sound" size={18} color="var(--muted)" /></button>
              <div className="grow">
                <div className="w">{e.word} <span className="en muted" style={{ fontStyle: 'italic', fontWeight: 400, fontSize: 15 }}>{e.pos}</span></div>
                <div className="m">{e.meaning}</div>
              </div>
              {tag}
              {e.source !== 'base' && (
                <button className="icon-btn" style={{ background: 'none', width: 36 }} aria-label={`${e.word} ${e.meaning} 삭제`} onClick={() => { if (confirm(`"${e.word} (${e.meaning})"를 삭제할까요? 학습 기록도 지워져요.`)) removeEntry(e.id); }}>
                  <Icon name="trash" size={18} color="var(--muted)" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
