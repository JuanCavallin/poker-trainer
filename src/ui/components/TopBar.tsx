import { useState } from 'react';
import { levelFromXp, titleFor } from '../../learning/progress';
import { liveStreak, useStore } from '../../state/store';
import { useNav, type Screen } from '../nav';

export const NAV: { screen: Screen; icon: string; label: string; mobile?: boolean }[] = [
  { screen: 'home', icon: '🏡', label: 'Den', mobile: true },
  { screen: 'train', icon: '🎯', label: 'Train', mobile: true },
  { screen: 'drills', icon: '🧪', label: 'Drills' },
  { screen: 'blitz', icon: '⚡', label: 'Blitz', mobile: true },
  { screen: 'woodpecker', icon: '🐦', label: 'Woodpecker' },
  { screen: 'garden', icon: '🌱', label: 'Garden', mobile: true },
  { screen: 'progress', icon: '📈', label: 'Progress', mobile: true },
  { screen: 'trophies', icon: '🏆', label: 'Trophies' },
  { screen: 'learn', icon: '📚', label: 'Learn' },
];

export function TopBar() {
  const { screen, go } = useNav();
  const [more, setMore] = useState(false);
  const xp = useStore((s) => s.xp);
  const chips = useStore((s) => s.chips);
  const streak = useStore((s) => s.streak);
  const lv = levelFromXp(xp);
  const r = 16;
  const c = 2 * Math.PI * r;
  const days = liveStreak(streak);
  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => go('home')}>
          <span className="brand-mark">🂡</span>
          <span className="wordmark">Range Den</span>
        </button>
        <nav className="nav">
          {NAV.map((n) => (
            <button key={n.screen} className={screen === n.screen ? 'active' : ''} onClick={() => go(n.screen, n.screen === 'train' ? { kind: 'regular' } : undefined)}>
              <span>{n.icon}</span>
              <span className="lbl">{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="stats-pills">
          <span className="pill fire" title={`${days}-day streak${streak.freezes ? ` · ${streak.freezes} spare log(s) protect a missed day` : ''}`}>
            🔥 {days}
            {streak.freezes > 0 && <span className="tiny">🪵{streak.freezes}</span>}
          </span>
          <button className="pill" onClick={() => go('shop')} title="Chips: spend them in the shop" style={{ cursor: 'pointer' }}>
            🪙 {chips}
          </button>
          <button className="level-pill" onClick={() => go('progress')} title={`${titleFor(lv.level)} · ${lv.into}/${lv.span} XP to next level`}>
            <span className="level-badge">
              <svg width={38} height={38}>
                <circle cx={19} cy={19} r={r} fill="var(--panel-2)" stroke="var(--line)" strokeWidth={3} />
                <circle cx={19} cy={19} r={r} fill="none" stroke="var(--honey)" strokeWidth={3} strokeLinecap="round" strokeDasharray={`${(c * lv.into) / lv.span} ${c}`} transform="rotate(-90 19 19)" />
              </svg>
              <span style={{ position: 'relative' }}>{lv.level}</span>
            </span>
          </button>
          <button className="btn ghost small" onClick={() => go('settings')} title="Settings" aria-label="Settings">
            ⚙️
          </button>
        </div>
      </header>
      <nav className="bottom-nav">
        {NAV.filter((n) => n.mobile).map((n) => (
          <button key={n.screen} className={screen === n.screen ? 'active' : ''} onClick={() => (setMore(false), go(n.screen, n.screen === 'train' ? { kind: 'regular' } : undefined))}>
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <button className={more || MORE.some((m) => m.screen === screen) ? 'active' : ''} onClick={() => setMore(!more)} aria-expanded={more}>
          <span>☰</span>
          <span>More</span>
        </button>
      </nav>
      {more && (
        <div className="more-sheet" role="menu">
          {MORE.map((m) => (
            <button
              key={m.screen}
              role="menuitem"
              onClick={() => {
                setMore(false);
                go(m.screen);
              }}
            >
              <span>{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const MORE: { screen: Screen; icon: string; label: string }[] = [
  ...NAV.filter((n) => !n.mobile),
  { screen: 'shop', icon: '🛍️', label: 'Shop' },
  { screen: 'settings', icon: '⚙️', label: 'Settings' },
];
