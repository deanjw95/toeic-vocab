import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Go } from '../App';
import { findInSentence } from '../lib/quiz';
import { formatInterval, previewDue } from '../lib/srs';
import { useVocab } from '../lib/store';
import type { Entry, Grade } from '../lib/types';
import { Highlight, Icon, speak } from '../ui';

const LABELS: Record<Grade, string> = { 1: '다시', 2: '어려움', 3: '알맞음', 4: '쉬움' };
const REQUEUE_MS = 20 * 60_000; // cards due again within 20 min come back in this session
const SWIPE_PX = 90;

export default function Study({ go, entries, title }: { go: Go; entries: Entry[]; title: string }) {
  const { cards, settings, grade } = useVocab();
  const [queue, setQueue] = useState<Entry[]>(entries);
  const [idx, setIdx] = useState(0);
  const [back, setBack] = useState(false);
  const [dx, setDx] = useState(0);
  const [stats, setStats] = useState({ again: 0, ok: 0 });
  const shownAt = useRef(Date.now());
  const drag = useRef<{ x: number; dx: number; moved: boolean } | null>(null);
  const busy = useRef(false);

  const cur = queue[idx];
  const isNew = cur ? !cards.has(cur.id) : false;
  const preview = useMemo(() => (cur ? previewDue(settings.retention, cards.get(cur.id)) : null), [cur, cards, settings.retention]);
  const found = useMemo(() => (cur ? findInSentence(cur.example, cur.word) : null), [cur]);

  useEffect(() => {
    shownAt.current = Date.now();
  }, [idx]);

  const answer = useCallback(
    async (g: Grade) => {
      if (!cur || busy.current) return;
      busy.current = true;
      const next = await grade(cur.id, g, 'card', Date.now() - shownAt.current);
      setStats((s) => (g === 1 ? { ...s, again: s.again + 1 } : { ...s, ok: s.ok + 1 }));
      if (next.due - Date.now() < REQUEUE_MS) setQueue((q) => [...q, cur]);
      setBack(false);
      setDx(0);
      setIdx((i) => i + 1);
      busy.current = false;
    },
    [cur, grade]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!cur) return;
      if (e.code === 'Space' || e.key === 'Enter') {
        e.preventDefault();
        setBack((b) => !b);
      } else if (back && ['1', '2', '3', '4'].includes(e.key)) answer(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cur, back, answer]);

  if (!entries.length) {
    return (
      <main className="page">
        <div className="topbar"><button className="icon-btn" aria-label="닫기" onClick={() => go({ name: 'home' })}><Icon name="close" /></button></div>
        <div className="empty">학습할 카드가 없어요.</div>
      </main>
    );
  }

  if (!cur) {
    return (
      <main className="page done">
        <div style={{ flex: 1 }} />
        <div className="big">{stats.ok + stats.again}</div>
        <h1 className="h1">{title} 끝!</h1>
        <p className="muted" style={{ margin: 0, lineHeight: 1.6 }}>
          기억남 {stats.ok}번, 다시 {stats.again}번.
          <br />다음 복습 날짜는 단어마다 자동으로 잡혔어요.
        </p>
        <div style={{ flex: 1 }} />
        <button className="btn" onClick={() => go({ name: 'home' })}>홈으로</button>
      </main>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, dx: 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const d = e.clientX - drag.current.x;
    if (Math.abs(d) > 6) drag.current.moved = true;
    if (!back) return; // only a flipped card can be swiped
    drag.current.dx = d;
    setDx(d);
  };
  const onPointerUp = () => {
    const g = drag.current;
    drag.current = null;
    if (back && g && Math.abs(g.dx) > SWIPE_PX) return answer(g.dx < 0 ? 1 : 3);
    setDx(0);
    if (!g?.moved) setBack((b) => !b);
  };

  const now = Date.now();
  return (
    <main className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="학습 닫기" onClick={() => go({ name: 'home' })}><Icon name="close" /></button>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={queue.length} aria-valuenow={idx}><i style={{ width: `${(idx / queue.length) * 100}%` }} /></div>
        <span className="count">{idx + 1} / {queue.length}</span>
      </div>

      <div className="stack">
        <div
          className={`flash${dx !== 0 ? ' dragging' : ''}`}
          role="button"
          tabIndex={0}
          aria-label={back ? '카드 앞면 보기' : '카드 뒤집어 뜻 보기'}
          style={{ transform: `translateX(${dx}px) rotate(${dx / 30}deg)` }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { drag.current = null; setDx(0); }}
        >
          <div className="tags">
            <span className={`pill ${isNew ? 'new' : 'review'}`}>{isNew ? '새 단어' : '복습'}</span>
          </div>
          {dx < -30 && <span className="swipe-tag left">다시</span>}
          {dx > 30 && <span className="swipe-tag right">알맞음</span>}
          <span className="word">{cur.word}</span>
          {cur.pos && <span className="pos">{cur.pos}</span>}
          {back ? (
            <>
              <span className="rule" />
              <span className="meaning">{cur.meaning}</span>
              {cur.example && (
                <span className="ex">
                  <Highlight text={cur.example} find={found} />{' '}
                  <button className="icon-btn" style={{ display: 'inline-flex', verticalAlign: 'middle', width: 32, height: 32, background: 'none' }} aria-label="예문 듣기"
                    onClick={(e) => { e.stopPropagation(); speak(cur.example); }}><Icon name="sound" size={16} color="var(--muted)" /></button>
                </span>
              )}
              {cur.exampleKo && <span className="ko">{cur.exampleKo}</span>}
            </>
          ) : (
            <span className="hint">탭해서 뜻 보기</span>
          )}
          <button
            className="speak"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); speak(cur.word); }}
          >
            <Icon name="sound" size={18} />발음 듣기
          </button>
        </div>
      </div>

      {back && preview ? (
        <div className="grades">
          {([1, 2, 3, 4] as Grade[]).map((g) => (
            <button key={g} className={`g${g}`} onClick={() => answer(g)}>
              <b>{LABELS[g]}</b>
              <span>{formatInterval(preview[g] - now)}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="swipe-hint">
          <span className="row" style={{ gap: 6 }}><Icon name="arrowL" size={16} color="var(--again)" />밀면 다시</span>
          <span className="row" style={{ gap: 6 }}>밀면 알맞음<Icon name="arrowR" size={16} color="var(--accent)" /></span>
        </div>
      )}
    </main>
  );
}
