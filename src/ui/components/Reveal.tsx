import { useEffect, useState } from 'react';
import { comboC1, comboC2 } from '../../engine/combos';
import { HF, describeHand } from '../../engine/handinfo';
import type { SpotPackage } from '../../engine/types';
import { ACTION_COLOR, pct } from '../util';
import { PlayingCard } from './Cards';

export function rollFromMix(mix: number[]): number {
  let x = Math.random();
  for (let a = 0; a < mix.length; a++) {
    x -= mix[a];
    if (x <= 0) return a;
  }
  return mix.findIndex((p) => p > 0);
}

export function HandReveal({ spot, k, userMix, onConfirm }: { spot: SpotPackage; k: number; userMix: number[]; onConfirm: (a: number) => void }) {
  const id = spot.hero.combos[k];
  const c1 = comboC1[id];
  const c2 = comboC2[id];
  const desc = describeHand(spot.board, c1, c2);
  const [choice, setChoice] = useState(() => rollFromMix(userMix));
  const mixed = userMix.filter((p) => p > 0.001).length > 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const n = Number(e.key);
      if (n >= 1 && n <= spot.actions.length) setChoice(n - 1);
      if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm(choice);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [choice, onConfirm, spot.actions.length]);

  return (
    <div className="panel reveal">
      <div className="small muted" style={{ fontWeight: 800, letterSpacing: 0.4 }}>
        THE DEALER SLIDES YOU…
      </div>
      <div className="hand">
        <PlayingCard card={c1} size={64} flip />
        <PlayingCard card={c2} size={64} flip delay={140} />
      </div>
      <div>
        <h3 style={{ marginBottom: 2 }}>{desc.label}</h3>
        <div className="small muted">
          {pct(spot.hero.equity[k])} equity vs villain's range
          {desc.flags & HF.NUT_FLUSH_BLOCKER ? ' · holds the nut-flush blocker' : desc.flags & HF.FLUSH_BLOCKER ? ' · holds a flush blocker' : ''}
        </div>
      </div>
      <div className="small">
        Your range plays this hand:{' '}
        <b>
          {spot.actions
            .map((a, i) => (userMix[i] > 0.001 ? `${a.short}${mixed ? ` ${pct(userMix[i])}` : ''}` : ''))
            .filter(Boolean)
            .join(' / ')}
        </b>
        {mixed && <span className="muted"> — the randomiser picked one; change it if you like</span>}
      </div>
      <div className="choice-row">
        {spot.actions.map((a, i) => (
          <button key={i} className={`choice${choice === i ? ' on' : ''}`} style={{ ['--c' as string]: ACTION_COLOR[a.key] }} onClick={() => setChoice(i)}>
            {a.short}
            <small>{a.add > 0 ? `${a.add.toFixed(1)}bb · ${i + 1}` : i + 1}</small>
          </button>
        ))}
      </div>
      <button className="btn big" onClick={() => onConfirm(choice)}>
        Confirm {spot.actions[choice].short} <span className="kbd">Enter</span>
      </button>
    </div>
  );
}
