import { useEffect, useState } from 'react';
import { useVocab } from './lib/store';
import type { Entry } from './lib/types';
import { Icon } from './ui';
import Home from './screens/Home';
import Study from './screens/Study';
import Quiz, { type QuizMode } from './screens/Quiz';
import Wrong from './screens/Wrong';
import Words from './screens/Words';
import AddWord from './screens/AddWord';
import Settings from './screens/Settings';

export type Route =
  | { name: 'home' }
  | { name: 'words'; filter?: string }
  | { name: 'wrong' }
  | { name: 'settings' }
  | { name: 'add' }
  | { name: 'study'; entries: Entry[]; title: string }
  | { name: 'quiz'; entries: Entry[]; title: string; mode?: QuizMode };

export type Go = (r: Route) => void;

const TABS: { name: 'home' | 'words' | 'wrong' | 'settings'; label: string; icon: string }[] = [
  { name: 'home', label: '홈', icon: 'home' },
  { name: 'words', label: '단어장', icon: 'book' },
  { name: 'wrong', label: '오답노트', icon: 'alert' },
  { name: 'settings', label: '설정', icon: 'gear' },
];

export default function App() {
  const { ready, syncStatus, startSync } = useVocab();
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [nav, setNav] = useState(0); // remounts a screen on every navigation, even to the same screen
  const go: Go = (r) => {
    window.speechSynthesis?.cancel();
    setRoute(r);
    setNav((n) => n + 1);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    document.title = '토익 단어장';
  }, []);

  // A "연결 링크" from another device: …/#sync=<key>
  useEffect(() => {
    const m = location.hash.match(/sync=([a-z0-9-]+)/i);
    if (!ready || !m) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (syncStatus.on) return;
    if (confirm('다른 기기와 단어장을 동기화할까요? 두 기기의 기록이 합쳐져요.')) {
      startSync(m[1].toLowerCase(), false).then(
        () => alert('동기화를 켰어요.'),
        (e) => alert(e instanceof Error ? e.message : '연결하지 못했어요.')
      );
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <div className="app"><div className="page empty">불러오는 중…</div></div>;

  const showTabs = TABS.some((t) => t.name === route.name);
  return (
    <div className="app">
      {route.name === 'home' && <Home go={go} />}
      {route.name === 'words' && <Words go={go} initialFilter={route.filter} />}
      {route.name === 'wrong' && <Wrong go={go} />}
      {route.name === 'settings' && <Settings />}
      {route.name === 'add' && <AddWord go={go} />}
      {route.name === 'study' && <Study key={nav} go={go} entries={route.entries} title={route.title} />}
      {route.name === 'quiz' && <Quiz key={nav} go={go} entries={route.entries} title={route.title} initialMode={route.mode} />}
      {showTabs && (
        <div className="tabbar">
          <nav aria-label="메뉴">
            {TABS.map((t) => (
              <button key={t.name} aria-current={route.name === t.name ? 'page' : undefined} onClick={() => go({ name: t.name } as Route)}>
                <Icon name={t.icon} size={22} stroke={2} />
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
