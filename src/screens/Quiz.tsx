import { useEffect, useMemo, useRef, useState } from 'react';
import type { Go } from '../App';
import { distractors, findInSentence, gradeTyped, shuffle, type TypedResult } from '../lib/quiz';
import { formatInterval } from '../lib/srs';
import { useVocab } from '../lib/store';
import type { Entry, Grade } from '../lib/types';
import { Icon, speak } from '../ui';

export type QuizMode = 'choice' | 'typing';
const SLOW_MS = 8000;
const LETTERS = ['A', 'B', 'C', 'D'];

interface Outcome { entry: Entry; ok: boolean }

export default function Quiz({ go, entries, title, initialMode = 'choice' }: { go: Go; entries: Entry[]; title: string; initialMode?: QuizMode }) {
  const { entries: all, settings, grade } = useVocab();
  const [mode, setMode] = useState<QuizMode>(initialMode);
  const [round, setRound] = useState(0);
  const questions = useMemo(() => shuffle(entries).slice(0, settings.quizLength), [entries, settings.quizLength, round]);
  const [i, setI] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);

  const restart = (list?: Entry[]) => {
    if (list) go({ name: 'quiz', entries: list, title: '틀린 단어 다시', mode });
    else { setRound((r) => r + 1); setI(0); setOutcomes([]); }
  };

  const record = async (e: Entry, g: Grade, ms: number, ok: boolean) => {
    const next = await grade(e.id, g, mode, ms);
    setOutcomes((o) => [...o, { entry: e, ok }]);
    return next;
  };

  if (!questions.length) {
    return (
      <main className="page">
        <div className="topbar"><button className="icon-btn" aria-label="닫기" onClick={() => go({ name: 'home' })}><Icon name="close" /></button></div>
        <div className="empty">퀴즈를 낼 단어가 없어요.</div>
      </main>
    );
  }

  if (i >= questions.length) {
    const score = outcomes.filter((o) => o.ok).length;
    const missed = outcomes.filter((o) => !o.ok).map((o) => o.entry);
    return (
      <main className="page">
        <div className="qcard center">
          <span className="muted small">{title}</span>
          <span className="qword" style={{ color: 'var(--accent-ink)' }}>{score} / {questions.length}</span>
          <span className="muted">{score === questions.length ? '전부 맞혔어요.' : `틀린 ${missed.length}개는 오답노트에 담았어요.`}</span>
        </div>
        {missed.length > 0 && (
          <div className="list">
            {missed.map((e) => (
              <div className="item" key={e.id}>
                <div className="grow"><div className="w">{e.word}</div><div className="m">{e.meaning}</div></div>
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: 1 }} />
        {missed.length > 0 && <button className="btn" onClick={() => restart(missed)}>틀린 단어만 다시</button>}
        <button className="btn soft" onClick={() => restart()}>새로 한 판 더</button>
        <button className="btn ghost" onClick={() => go({ name: 'home' })}>홈으로</button>
      </main>
    );
  }

  const q = questions[i];
  return (
    <main className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="퀴즈 닫기" onClick={() => go({ name: 'home' })}><Icon name="close" /></button>
        <div className="seg" role="group" aria-label="문제 유형">
          <button aria-pressed={mode === 'choice'} onClick={() => setMode('choice')}>객관식</button>
          <button aria-pressed={mode === 'typing'} onClick={() => setMode('typing')}>주관식</button>
        </div>
        <span className="count">{i + 1} / {questions.length}</span>
      </div>
      {mode === 'choice'
        ? <Choice key={`c${round}-${i}`} q={q} pool={all.length >= 4 ? all : entries} onDone={record} onNext={() => setI(i + 1)} />
        : <Typing key={`t${round}-${i}`} q={q} onDone={record} onNext={() => setI(i + 1)} />}
    </main>
  );
}

type DoneFn = (e: Entry, g: Grade, ms: number, ok: boolean) => Promise<{ due: number }>;

function Choice({ q, pool, onDone, onNext }: { q: Entry; pool: Entry[]; onDone: DoneFn; onNext: () => void }) {
  const options = useMemo(() => shuffle([q, ...distractors(q, pool, 'meaning')]), [q, pool]);
  const [picked, setPicked] = useState<string | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const start = useRef(Date.now());

  const pick = async (o: Entry) => {
    if (picked) return;
    setPicked(o.id);
    const ms = Date.now() - start.current;
    const ok = o.id === q.id;
    if (!ok) speak(q.word);
    const next = await onDone(q, ok ? (ms > SLOW_MS ? 2 : 3) : 1, ms, ok);
    setDue(next.due);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = 'abcd'.indexOf(e.key.toLowerCase());
      const m = ['1', '2', '3', '4'].indexOf(e.key);
      const k = n >= 0 ? n : m;
      if (!picked && k >= 0 && options[k]) pick(options[k]);
      else if (picked && e.key === 'Enter') onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const ok = picked === q.id;
  return (
    <>
      <div className="qcard center">
        <span className="small muted">알맞은 뜻을 고르세요</span>
        <span className="qword">{q.word}</span>
        {q.pos && <span className="en muted" style={{ fontStyle: 'italic', fontSize: 18 }}>{q.pos}</span>}
        <button className="icon-btn" style={{ background: 'var(--accent-tint)', color: 'var(--accent-ink)', borderRadius: 999 }} aria-label="발음 듣기" onClick={() => speak(q.word)}>
          <Icon name="sound" />
        </button>
      </div>
      <div className="options">
        {options.map((o, k) => {
          const cls = picked ? (o.id === q.id ? 'right' : o.id === picked ? 'wrong' : '') : '';
          return (
            <button key={o.id} className={`opt ${cls}`} onClick={() => pick(o)} aria-label={`${LETTERS[k]}. ${o.meaning}`}>
              <span className="bubble">{LETTERS[k]}</span>
              <span className="grow">{o.meaning}</span>
              {cls === 'right' && <Icon name="check" size={22} color="var(--easy)" stroke={2.6} />}
              {cls === 'wrong' && <Icon name="close" size={22} color="var(--again)" stroke={2.6} />}
            </button>
          );
        })}
      </div>
      <div style={{ flex: 1 }} />
      {picked && (
        <>
          <div className={`result ${ok ? 'right' : 'wrong'}`} role="status">
            <b>{ok ? '정답이에요' : '오답이에요'}</b>
            <span>{q.example}</span>
            {due && <span>{ok ? `다음 복습은 ${formatInterval(due - Date.now())} 뒤예요.` : `오답노트에 담았어요. ${formatInterval(due - Date.now())} 뒤 다시 나와요.`}</span>}
          </div>
          <button className="btn dark" onClick={onNext}>다음 문제</button>
        </>
      )}
    </>
  );
}

function Typing({ q, onDone, onNext }: { q: Entry; onDone: DoneFn; onNext: () => void }) {
  const found = useMemo(() => findInSentence(q.example, q.word), [q]);
  const [value, setValue] = useState('');
  const [result, setResult] = useState<TypedResult | null>(null);
  const [due, setDue] = useState<number | null>(null);
  const start = useRef(Date.now());
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const answer = found && found.form.toLowerCase() !== q.word.toLowerCase() ? found.form : q.word;
  const check = async () => {
    if (result || !value.trim()) return;
    const tries = [gradeTyped(value, q.word), gradeTyped(value, answer)];
    const r: TypedResult = tries.includes('right') ? 'right' : tries.includes('close') ? 'close' : 'wrong';
    setResult(r);
    speak(answer);
    const next = await onDone(q, r === 'right' ? 3 : r === 'close' ? 2 : 1, Date.now() - start.current, r === 'right');
    setDue(next.due);
  };

  const letters = answer.replace(/[^A-Za-z]/g, '').length;
  return (
    <>
      <div className="qcard">
        <span className="small muted">{found ? '빈칸에 알맞은 단어를 쓰세요' : '뜻에 맞는 영단어를 쓰세요'}</span>
        {found ? (
          <span className="sentence">
            {q.example.slice(0, found.start)}
            <span className="blank">{result ? answer : ' '}</span>
            {q.example.slice(found.end)}
          </span>
        ) : (
          <span className="qmeaning">{q.meaning}</span>
        )}
        {q.exampleKo && found && <span className="small" style={{ color: 'var(--ink-2)' }}>{q.exampleKo}</span>}
        <div className="hints">
          {found && <span className="pill">뜻: {q.meaning}</span>}
          <span className="pill">{answer[0]}로 시작</span>
          <span className="pill">{letters}글자</span>
          {q.pos && <span className="pill">{q.pos}</span>}
        </div>
      </div>
      <form className="field" onSubmit={(e) => { e.preventDefault(); result ? onNext() : check(); }}>
        <label htmlFor="answer">내 답</label>
        <input
          id="answer"
          ref={input}
          className="input en big"
          style={result ? { borderColor: `var(--${result === 'right' ? 'easy' : result === 'close' ? 'hard' : 'again'})` } : undefined}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          readOnly={!!result}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="영단어 입력"
        />
      </form>
      {result && (
        <div className={`result ${result}`} role="status">
          <b>{result === 'right' ? '정답이에요' : result === 'close' ? '거의 맞았어요' : '오답이에요'}</b>
          <span>
            {result === 'right' ? '' : `정답은 ${answer}예요. `}
            {due && (result === 'right' ? `다음 복습은 ${formatInterval(due - Date.now())} 뒤예요.` : result === 'close' ? `철자가 한 글자 달라서 어려움으로 기록했어요.` : `오답노트에 담았어요.`)}
          </span>
        </div>
      )}
      <div style={{ flex: 1 }} />
      {result ? <button className="btn dark" onClick={onNext}>다음 문제</button> : <button className="btn" disabled={!value.trim()} onClick={check}>정답 확인</button>}
    </>
  );
}
