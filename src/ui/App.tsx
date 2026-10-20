import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { Confetti, Toasts } from './components/Overlays';
import { TopBar } from './components/TopBar';
import { useNav } from './nav';
import { Blitz } from './screens/Blitz';
import { Drills } from './screens/Drills';
import { Garden } from './screens/Garden';
import { Home } from './screens/Home';
import { Learn } from './screens/Learn';
import { Progress } from './screens/Progress';
import { Settings } from './screens/Settings';
import { Shop } from './screens/Shop';
import { Sketch } from './screens/Sketch';
import { Trainer } from './screens/Trainer';
import { Trophies } from './screens/Trophies';
import { Woodpecker } from './screens/Woodpecker';

function usePrefersDark(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function App() {
  const screen = useNav((s) => s.screen);
  const key = useNav((s) => s.key);
  const session = useNav((s) => s.session);
  const theme = useStore((s) => s.settings.theme);
  const reduced = useStore((s) => s.settings.reducedMotion);
  const prefersDark = usePrefersDark();
  const resolved = theme === 'auto' ? (prefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#1c1612' : '#f6eee2');
  }, [resolved]);

  useEffect(() => {
    useStore.getState().ensureDaily();
  }, []);

  return (
    <div className={`app${reduced ? ' reduced-motion' : ''}`}>
      <TopBar />
      <main className="main">
        {screen === 'home' && <Home />}
        {screen === 'train' && <Trainer key={key} session={session} />}
        {screen === 'drills' && <Drills />}
        {screen === 'blitz' && <Blitz key={key} />}
        {screen === 'woodpecker' && <Woodpecker />}
        {screen === 'sketch' && <Sketch key={key} session={session.kind === 'sketch' ? session : { kind: 'sketch' }} />}
        {screen === 'garden' && <Garden />}
        {screen === 'progress' && <Progress />}
        {screen === 'trophies' && <Trophies />}
        {screen === 'shop' && <Shop />}
        {screen === 'learn' && <Learn />}
        {screen === 'settings' && <Settings />}
      </main>
      <Toasts />
      <Confetti />
    </div>
  );
}
