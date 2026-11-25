import { useRef, useState } from 'react';
import { useVocab } from '../lib/store';
import { newKey, normalizeKey, telegramLink, telegramTest, telegramUnlink } from '../lib/sync';

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

function ExamplesSection() {
  const { entries, syncStatus, examples, requestExamples } = useVocab();
  const missing = entries.filter((e) => !e.example?.trim()).length;
  const pending = !!examples.requestedAt && (examples.doneAt ?? 0) < examples.requestedAt;
  const when = (t?: number) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="h2">예문 채우기 (Mac)</h2>
      <span className="note">
        예문이 없는 단어 {missing}개. Mac의 Claude Code가 내가 쓴 뜻에 맞춰 토익 예문과 해석을 채워요.
        매일 12:00에 자동으로 하고, 아래 버튼을 누르면 몇 분 안에 해요. Mac이 켜져 있을 때만 동작해요.
      </span>
      {!syncStatus.on ? (
        <span className="note">먼저 위에서 기기 동기화를 켜 주세요. Mac이 동기화로 단어를 받아 가요.</span>
      ) : (
        <button className="btn soft" disabled={!missing || pending} onClick={() => requestExamples()}>
          {pending ? 'Mac이 받아 가기를 기다리는 중…' : missing ? `지금 예문 채우기 (${missing}개)` : '채울 예문이 없어요'}
        </button>
      )}
      {examples.doneAt && (
        <span className="note">
          마지막 실행 {when(examples.doneAt)} · {examples.error ? `실패: ${examples.error}` : `${examples.filled ?? 0}개 채움`}
        </span>
      )}
      <span className="note">처음 한 번은 Mac에서 설정이 필요해요. 저장소의 mac/README.md를 따라 해 주세요.</span>
    </section>
  );
}

export default function Settings() {
  const { settings: s, saveSettings, exportBackup, importBackup, resetProgress, entries, logs } = useVocab();
  const file = useRef<HTMLInputElement>(null);

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

      <ExamplesSection />

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
