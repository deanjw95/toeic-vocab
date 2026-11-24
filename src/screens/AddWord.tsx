import { useState } from 'react';
import type { Go } from '../App';
import { lookupWord, providersToTry, type LookupResult, type Sense } from '../lib/ai';
import { findInSentence } from '../lib/quiz';
import { useVocab } from '../lib/store';
import { Highlight, Icon, speak } from '../ui';

const PROVIDER_NAME = { gemini: 'Gemini', ollama: 'Mac 로컬 모델' } as const;

interface Row extends Sense { on: boolean }

export default function AddWord({ go }: { go: Go }) {
  const { entries, settings, addEntries } = useVocab();
  const [word, setWord] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [res, setRes] = useState<LookupResult | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [manual, setManual] = useState(providersToTry(settings).length === 0);
  const [m, setM] = useState({ pos: '', meaning: '', example: '' });
  const [saved, setSaved] = useState('');

  const existing = (w: string) => entries.filter((e) => e.word.toLowerCase() === w.trim().toLowerCase());

  const find = async (w = word, fresh = false) => {
    if (!w.trim()) return;
    setLoading(true); setError(''); setRes(null); setSaved('');
    try {
      const r = await lookupWord(w, settings, { fresh });
      setRes(r);
      const have = new Set(existing(w).map((e) => e.meaning));
      setRows(r.senses.map((s) => ({ ...s, on: !have.has(s.meaning) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const w = (res?.word ?? word).trim();
    const pick = rows.filter((r) => r.on && r.meaning.trim());
    await addEntries(pick.map((r) => ({ word: w, pos: r.pos, meaning: r.meaning.trim(), example: r.example, exampleKo: r.exampleKo, day: 0, source: 'ai' as const })));
    setSaved(`${w} 뜻 ${pick.length}개를 내 단어에 넣었어요.`);
    setRes(null); setRows([]); setWord('');
  };

  const saveManual = async () => {
    if (!word.trim() || !m.meaning.trim()) return;
    await addEntries([{ word: word.trim(), pos: m.pos.trim(), meaning: m.meaning.trim(), example: m.example.trim(), day: 0, source: 'user' }]);
    setSaved(`${word.trim()}를 내 단어에 넣었어요.`);
    setWord(''); setM({ pos: '', meaning: '', example: '' });
  };

  const count = rows.filter((r) => r.on).length;
  const dup = word.trim() ? existing(word) : [];

  return (
    <main className="page">
      <div className="topbar">
        <button className="icon-btn" aria-label="뒤로" onClick={() => go({ name: 'words', filter: 'my' })}><Icon name="back" /></button>
        <h1 className="h1 grow" style={{ fontSize: 20 }}>단어 추가</h1>
        <button className="chip" style={{ border: 0 }} aria-pressed={manual} onClick={() => setManual(!manual)}>{manual ? '자동 채우기' : '직접 입력'}</button>
      </div>

      <form className="field" onSubmit={(e) => { e.preventDefault(); if (!manual) find(); }}>
        <label htmlFor="word">영단어</label>
        <div className="row" style={{ gap: 8 }}>
          <input id="word" className="input en grow" value={word} onChange={(e) => setWord(e.target.value)} autoCapitalize="off" autoComplete="off" autoCorrect="off" spellCheck={false} placeholder="예: commission" autoFocus />
          {!manual && <button type="submit" className="btn dark" style={{ width: 'auto', height: 52, padding: '0 18px', fontSize: 15 }} disabled={loading || !word.trim()}>{loading ? '찾는 중…' : '뜻 찾기'}</button>}
        </div>
        {dup.length > 0 && <span className="note">이미 단어장에 있어요: {dup.map((d) => d.meaning).join(' / ')}</span>}
      </form>

      {saved && <div className="result right" role="status"><b>저장했어요</b><span>{saved}</span></div>}
      {error && <div className="error" role="alert">{error}</div>}

      {manual ? (
        <>
          <div className="row" style={{ gap: 8 }}>
            <div className="field" style={{ width: 96 }}><label htmlFor="pos">품사</label><input id="pos" className="input" placeholder="n." value={m.pos} onChange={(e) => setM({ ...m, pos: e.target.value })} /></div>
            <div className="field grow"><label htmlFor="meaning">뜻</label><input id="meaning" className="input" placeholder="수수료" value={m.meaning} onChange={(e) => setM({ ...m, meaning: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="example">예문 (선택)</label><textarea id="example" className="input en" style={{ fontSize: 17 }} rows={2} value={m.example} onChange={(e) => setM({ ...m, example: e.target.value })} /></div>
          {providersToTry(settings).length === 0 && <p className="note" style={{ margin: 0 }}>설정에서 Gemini API 키나 Mac 로컬 모델을 넣으면 뜻과 예문을 자동으로 채울 수 있어요.</p>}
          <div style={{ flex: 1 }} />
          <button className="btn" disabled={!word.trim() || !m.meaning.trim()} onClick={saveManual}>저장</button>
        </>
      ) : res ? (
        <>
          {res.senses.length === 0 ? (
            <div className="error">
              토익 뜻을 찾지 못했어요.{res.suggestion ? ` 혹시 "${res.suggestion}"인가요?` : ' 철자를 확인해 주세요.'}
              {res.suggestion && <><br /><button className="chip" style={{ border: 0, marginTop: 8 }} onClick={() => { setWord(res.suggestion!); find(res.suggestion!); }}>{res.suggestion}로 찾기</button></>}
            </div>
          ) : (
            <>
              <div className="row">
                <span className="small grow" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>토익에 자주 나오는 뜻 {res.senses.length}개를 찾았어요. 넣을 뜻을 고르세요.</span>
                <button className="icon-btn" aria-label="발음 듣기" onClick={() => speak(res.word)}><Icon name="sound" size={18} /></button>
              </div>
              {rows.map((r, k) => (
                <label key={k} className={`sense${r.on ? ' on' : ''}`}>
                  <input type="checkbox" checked={r.on} onChange={() => setRows(rows.map((x, j) => (j === k ? { ...x, on: !x.on } : x)))} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: 1 }}>
                    <span className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                      <i className="en muted" style={{ fontSize: 16 }}>{r.pos}</i>
                      <input className="meaning-in" aria-label="뜻 고치기" value={r.meaning} onChange={(e) => setRows(rows.map((x, j) => (j === k ? { ...x, meaning: e.target.value } : x)))} />
                    </span>
                    <span className="ex"><Highlight text={r.example} find={findInSentence(r.example, res.word)} /></span>
                    <span className="ko">{r.exampleKo}</span>
                  </span>
                </label>
              ))}
              {res.collocations.length > 0 && (
                <div className="row" style={{ flexWrap: 'wrap', gap: 6 }}>
                  <span className="small muted">자주 쓰는 표현</span>
                  {res.collocations.map((c) => <span key={c} className="chip en" style={{ fontWeight: 400, fontSize: 15 }}>{c}</span>)}
                </div>
              )}
            </>
          )}
          <p className="note" style={{ margin: 0 }}>{PROVIDER_NAME[res.provider]}가 만든 뜻과 예문이에요. 틀린 곳이 있으면 뜻을 눌러 고친 뒤 저장하세요. <button className="note" style={{ border: 0, background: 'none', padding: 0, textDecoration: 'underline' }} onClick={() => find(res.word, true)}>다시 만들기</button></p>
          <div style={{ flex: 1 }} />
          {res.senses.length > 0 && <button className="btn" disabled={!count} onClick={save}>{count ? `뜻 ${count}개 저장` : '저장할 뜻을 골라 주세요'}</button>}
        </>
      ) : (
        !loading && !saved && !error && <p className="note" style={{ margin: 0 }}>영단어를 넣고 "뜻 찾기"를 누르면 토익에 자주 나오는 뜻과 뜻별 토익 예문을 채워 줘요. 뜻 하나가 카드 하나가 돼요.</p>
      )}
    </main>
  );
}
