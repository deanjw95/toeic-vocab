import { useMemo, useState } from 'react';
import type { Go } from '../App';
import { formatInterval } from '../lib/srs';
import { useVocab } from '../lib/store';
import { checkKey } from '../lib/words';
import type { Entry } from '../lib/types';
import { Icon, speak } from '../ui';

export default function Words({ go, initialFilter = 'all' }: { go: Go; initialFilter?: string }) {
  const { entries, cards, isMastered, removeEntry, updateEntry } = useVocab();
  const [filter, setFilter] = useState(['all', 'new', 'learning', 'done', 'noex', 'check'].includes(initialFilter) ? initialFilter : 'all');
  const [q, setQ] = useState('');
  const filters = [
    { key: 'all', label: '전체' },
    { key: 'new', label: '새 단어' },
    { key: 'learning', label: '학습 중' },
    { key: 'done', label: '암기' },
    { key: 'noex', label: '예문 없음' },
    ...(entries.some((e) => e.check) ? [{ key: 'check', label: `철자 확인 ${entries.filter((e) => e.check).length}` }] : []),
  ];

  const list = useMemo(() => {
    let l = [...entries].reverse(); // newest first
    if (filter === 'new') l = l.filter((e) => !cards.has(e.id));
    else if (filter === 'learning') l = l.filter((e) => cards.has(e.id) && !isMastered(e.id));
    else if (filter === 'done') l = l.filter((e) => isMastered(e.id));
    else if (filter === 'noex') l = l.filter((e) => !e.example?.trim());
    else if (filter === 'check') l = l.filter((e) => e.check);
    const s = q.trim().toLowerCase();
    if (s) l = l.filter((e) => e.word.toLowerCase().includes(s) || e.meaning.includes(q.trim()));
    return l;
  }, [entries, cards, isMastered, filter, q]);

  const title = filters.find((f) => f.key === filter)?.label ?? '전체';
  const now = Date.now();

  return (
    <main className="page with-tabs">
      <div className="row">
        <h1 className="h1 grow">단어장</h1>
        <button className="chip" style={{ border: 0 }} onClick={() => go({ name: 'add' })}><Icon name="plus" size={16} />단어 추가</button>
      </div>
      <div className="filters" role="group" aria-label="단어 분류">
        {filters.map((f) => (
          <button key={f.key} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>
      <div className="field">
        <label htmlFor="search" className="sr-only" style={{ position: 'absolute', left: -9999 }}>검색</label>
        <input id="search" className="input" type="search" placeholder="영단어나 뜻으로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {list.length > 0 && (
        <div className="tiles">
          <button className="btn soft" onClick={() => go({ name: 'study', entries: list, title })}>카드로 학습</button>
          <button className="btn" disabled={entries.length < 4} onClick={() => go({ name: 'quiz', entries: list, title: `${title} 퀴즈` })}>퀴즈</button>
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
                <div className="m">{e.meaning}{e.encounters ? <span className="small" style={{ color: 'var(--hard)', marginLeft: 6 }}>또 만남 {e.encounters}</span> : null}</div>
                {e.check && <CheckRow e={e} onFix={(patch) => updateEntry(e.id, patch)} />}
              </div>
              {tag}
              {(
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

/** Spelling suggestion from the Mac agent: accept it, or keep what the learner wrote. */
function CheckRow({ e, onFix }: { e: Entry; onFix: (patch: Partial<Entry>) => void }) {
  const c = e.check!;
  const fixed = { word: c.word ?? e.word, meaning: c.meaning ?? e.meaning };
  return (
    <div className="check" role="status">
      <span>
        철자 확인:{' '}
        {c.word && <><s className="en">{e.word}</s> → <b className="en">{c.word}</b>{c.meaning ? ', ' : ''}</>}
        {c.meaning && <><s>{e.meaning}</s> → <b>{c.meaning}</b></>}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <button className="chip" onClick={() => onFix({ ...fixed, check: undefined, checkedFor: checkKey(fixed) })}>고치기</button>
        <button className="chip" style={{ background: 'none' }} onClick={() => onFix({ check: undefined })}>그대로 두기</button>
      </span>
    </div>
  );
}
