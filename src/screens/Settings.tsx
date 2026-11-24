import { useRef, useState } from 'react';
import { lookupWord } from '../lib/ai';
import { useVocab } from '../lib/store';
import { newKey, normalizeKey, telegramLink, telegramTest, telegramUnlink } from '../lib/sync';
import type { AiProvider } from '../lib/types';

const ORDERS: { key: string; label: string; order: AiProvider[] }[] = [
  { key: 'ollama,gemini', label: 'Mac 로컬 모델 먼저, 안 되면 Gemini', order: ['ollama', 'gemini'] },
  { key: 'gemini,ollama', label: 'Gemini 먼저, 안 되면 로컬 모델', order: ['gemini', 'ollama'] },
  { key: 'gemini', label: 'Gemini만', order: ['gemini'] },
  { key: 'ollama', label: 'Mac 로컬 모델만', order: ['ollama'] },
];

const APP_URL = 'https://deanjw95.github.io/toeic-vocab/';

function ago(t?: number) {
  if (!t) return '아직 안 함';
  const m = Math.round((Date.now() - t) / 60_000);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.round(m / 60)}시간 전`;
}

function SyncSection() {
  const { syncStatus: st, syncNow, startSync, stopSync } = useVocab();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (f: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await f(); if (ok) setMsg({ ok: true, text: ok }); }
    catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); }
  };
  const copy = (text: string, done: string) => run(() => navigator.clipboard.writeText(text), done);

  if (!st.on) {
    return (
      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="h2">기기 동기화</h2>
        <span className="note">Mac과 휴대폰의 단어와 학습 기록을 맞춰요. 로그인 없이 동기화 코드 하나로 연결돼요.</span>
        <button className="btn" disabled={busy} onClick={() => run(() => startSync(newKey(), true), '동기화를 켰어요. 다른 기기에서 아래 코드나 링크로 연결하세요.')}>이 기기에서 처음 시작하기</button>
        <div className="field">
          <label htmlFor="sk">다른 기기에서 받은 동기화 코드</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="sk" className="input" style={{ flex: 1, minWidth: 0 }} autoCapitalize="off" autoComplete="off" spellCheck={false} placeholder="xxxxx-xxxxx-xxxxx-xxxxx" value={code} onChange={(e) => setCode(e.target.value)} />
            <button className="btn soft" style={{ width: 'auto', padding: '0 20px', flexShrink: 0 }} disabled={busy || normalizeKey(code).length < 20} onClick={() => run(() => startSync(normalizeKey(code), false), '연결됐어요. 두 기기의 기록을 합쳤어요.')}>연결</button>
          </div>
        </div>
        {busy && <span className="note">연결하는 중…</span>}
        {msg && <div className={msg.ok ? 'result right' : 'error'} role="status"><span>{msg.text}</span></div>}
      </section>
    );
  }

  const key = st.key!;
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="h2">기기 동기화</h2>
      <div className="field">
        <label>동기화 코드</label>
        <code style={{ fontSize: 17, letterSpacing: 0.5, background: 'var(--surface-2)', borderRadius: 12, padding: '10px 12px', wordBreak: 'break-all' }}>{key}</code>
        <span className="note">이 코드가 있으면 누구나 단어장에 들어올 수 있어요. 내 기기끼리만 주고받으세요.</span>
      </div>
      <div className="tiles">
        <button className="btn ghost" style={{ background: 'var(--surface-2)' }} onClick={() => copy(key, '코드를 복사했어요.')}>코드 복사</button>
        <button className="btn ghost" style={{ background: 'var(--surface-2)' }} onClick={() => copy(`${APP_URL}#sync=${key}`, '연결 링크를 복사했어요. 다른 기기에서 열면 바로 연결돼요.')}>연결 링크 복사</button>
      </div>
      <span className="note">마지막 동기화: {st.busy ? '하는 중…' : ago(st.lastAt)}</span>
      {st.error && <div className="error" role="status"><span>동기화 실패: {st.error}</span></div>}
      <button className="btn soft" disabled={st.busy} onClick={() => syncNow()}>지금 동기화</button>

      <h2 className="h2" style={{ marginTop: 8 }}>텔레그램 알림</h2>
      {st.telegram ? (
        <>
          <span className="note">연결됐어요. 매일 08:00, 12:30, 21:00에 복습 알림이 오고, 알림에서 바로 퀴즈를 풀 수 있어요.</span>
          <div className="tiles">
            <button className="btn ghost" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={() => run(() => telegramTest(key), '테스트 메시지를 보냈어요.')}>테스트 메시지</button>
            <button className="btn ghost" style={{ background: 'var(--surface-2)' }} disabled={busy} onClick={() => run(async () => { await telegramUnlink(key); await syncNow(); }, '연결을 해제했어요.')}>연결 해제</button>
          </div>
        </>
      ) : (
        <>
          <span className="note">버튼을 누르면 텔레그램 봇이 열려요. 봇 화면에서 "시작"을 누르면 연결돼요.</span>
          <button className="btn" disabled={busy} onClick={() => run(async () => {
            const w = window.open('', '_blank');
            const { url } = await telegramLink(key);
            if (w) w.location.href = url; else location.href = url;
          })}>텔레그램 연결</button>
        </>
      )}
      {msg && <div className={msg.ok ? 'result right' : 'error'} role="status"><span>{msg.text}</span></div>}
      <button className="btn ghost" onClick={() => { if (confirm('이 기기에서 동기화를 끌까요? 이 기기의 기록은 그대로 남아요.')) stopSync(); }}>이 기기 동기화 끄기</button>
    </section>
  );
}

export default function Settings() {
  const { settings: s, saveSettings, exportBackup, importBackup, resetProgress, entries, logs } = useVocab();
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const runTest = async (only: AiProvider) => {
    setTesting(true); setTest(null);
    try {
      const r = await lookupWord('agenda', { ...s, aiOrder: [only] }, { fresh: true });
      setTest({ ok: true, text: `연결됐어요. agenda: ${r.senses.map((x) => x.meaning).join(' / ')}` });
    } catch (e) {
      setTest({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  };

  const download = () => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `toeic-vocab-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="page with-tabs">
      <h1 className="h1">설정</h1>

      <SyncSection />

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="h2">학습</h2>
        <div className="field">
          <label htmlFor="npd">하루 새 단어</label>
          <input id="npd" className="input" type="number" min={1} max={200} value={s.newPerDay} onChange={(e) => saveSettings({ newPerDay: Math.max(1, Math.min(200, Number(e.target.value) || 1)) })} />
        </div>
        <div className="field">
          <label htmlFor="ret">목표 기억률 {Math.round(s.retention * 100)}%</label>
          <input id="ret" type="range" min={0.85} max={0.95} step={0.01} value={s.retention} onChange={(e) => saveSettings({ retention: Number(e.target.value) })} />
          <span className="note">높이면 더 자주 복습하고 덜 잊어요. 90%가 무난해요.</span>
        </div>
        <div className="field">
          <label htmlFor="ql">퀴즈 문항 수</label>
          <input id="ql" className="input" type="number" min={4} max={50} value={s.quizLength} onChange={(e) => saveSettings({ quizLength: Math.max(4, Math.min(50, Number(e.target.value) || 10)) })} />
        </div>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 className="h2">뜻 자동 채우기</h2>
        <div className="field">
          <label htmlFor="order">사용 순서</label>
          <select id="order" className="input" value={s.aiOrder.join(',')} onChange={(e) => saveSettings({ aiOrder: ORDERS.find((o) => o.key === e.target.value)!.order })}>
            {ORDERS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="gk">Gemini API 키</label>
          <input id="gk" className="input" type="password" autoComplete="off" placeholder="Google AI Studio에서 무료로 발급" value={s.geminiKey} onChange={(e) => saveSettings({ geminiKey: e.target.value.trim() })} />
        </div>
        <div className="field">
          <label htmlFor="gm">Gemini 모델</label>
          <input id="gm" className="input" value={s.geminiModel} onChange={(e) => saveSettings({ geminiModel: e.target.value.trim() })} />
        </div>
        <button className="btn soft" disabled={testing || !s.geminiKey} onClick={() => runTest('gemini')}>Gemini 연결 확인</button>
        <div className="field">
          <label htmlFor="ou">Mac 로컬 모델 주소 (Ollama)</label>
          <input id="ou" className="input" value={s.ollamaUrl} onChange={(e) => saveSettings({ ollamaUrl: e.target.value.trim() })} />
        </div>
        <div className="field">
          <label htmlFor="om">로컬 모델 이름</label>
          <input id="om" className="input" placeholder="ollama list에 나오는 이름" value={s.ollamaModel} onChange={(e) => saveSettings({ ollamaModel: e.target.value.trim() })} />
          <span className="note">브라우저에서 부르려면 Mac에서 한 번 실행: launchctl setenv OLLAMA_ORIGINS "*" 후 Ollama를 다시 켜세요.</span>
        </div>
        <button className="btn soft" disabled={testing || !s.ollamaModel} onClick={() => runTest('ollama')}>로컬 모델 연결 확인</button>
        {testing && <span className="note">확인하는 중…</span>}
        {test && <div className={test.ok ? 'result right' : 'error'} role="status"><span>{test.text}</span></div>}
        <span className="note">API 키는 백업 파일에는 들어가지 않아요. 동기화를 켜면 내 다른 기기에도 함께 옮겨져요.</span>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">백업</h2>
        <span className="note">단어 {entries.length}개, 복습 기록 {logs.length}개가 이 기기에 있어요. 동기화와 별개로 가끔 파일로 받아 두면 안전해요.</span>
        <div className="tiles">
          <button className="btn ghost" style={{ background: 'var(--surface-2)' }} onClick={download}>내보내기</button>
          <button className="btn ghost" style={{ background: 'var(--surface-2)' }} onClick={() => file.current?.click()}>불러오기</button>
        </div>
        <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try { await importBackup(await f.text()); alert('백업을 불러왔어요.'); } catch (err) { alert(err instanceof Error ? err.message : '불러오지 못했어요.'); }
          e.target.value = '';
        }} />
        <button className="btn danger" onClick={() => { if (confirm('학습 기록을 모두 지울까요? 단어는 그대로 남아요.')) resetProgress(); }}>학습 기록 초기화</button>
      </section>
    </main>
  );
}
