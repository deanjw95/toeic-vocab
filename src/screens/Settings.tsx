import { useRef, useState } from 'react';
import { lookupWord } from '../lib/ai';
import { useVocab } from '../lib/store';
import type { AiProvider } from '../lib/types';

const ORDERS: { key: string; label: string; order: AiProvider[] }[] = [
  { key: 'ollama,gemini', label: 'Mac 로컬 모델 먼저, 안 되면 Gemini', order: ['ollama', 'gemini'] },
  { key: 'gemini,ollama', label: 'Gemini 먼저, 안 되면 로컬 모델', order: ['gemini', 'ollama'] },
  { key: 'gemini', label: 'Gemini만', order: ['gemini'] },
  { key: 'ollama', label: 'Mac 로컬 모델만', order: ['ollama'] },
];

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
        <span className="note">API 키는 이 기기에만 저장되고 백업 파일에는 들어가지 않아요.</span>
      </section>

      <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 className="h2">백업</h2>
        <span className="note">단어 {entries.length}개, 복습 기록 {logs.length}개가 이 기기에 있어요. 기기 간 동기화가 붙기 전까지는 백업 파일로 옮기세요.</span>
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
