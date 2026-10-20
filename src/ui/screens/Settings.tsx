import { useState } from 'react';
import { exportData, useStore } from '../../state/store';
import type { Settings as S } from '../../state/types';
import { SeatPicker } from '../components/SeatPicker';

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button className={`switch${on ? ' on' : ''}`} onClick={() => onChange(!on)} aria-pressed={on} />;
}

export function Settings() {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const resetAll = useStore((s) => s.resetAll);
  const importData = useStore((s) => s.importData);
  const [io, setIo] = useState('');
  const [msg, setMsg] = useState('');
  const set = <K extends keyof S>(k: K, v: S[K]) => update({ [k]: v } as Partial<S>);

  return (
    <div className="col" style={{ gap: 18, maxWidth: 760 }}>
      <h1>⚙️ Settings</h1>
      <div className="panel">
        <h3>Look &amp; feel</h3>
        <div className="toggle-row">
          <div>
            <b>Theme</b>
            <div className="small muted">Daylight cabin or fireside night.</div>
          </div>
          <div className="seg">
            {(['light', 'dark', 'auto'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => set('theme', t)}>
                {t === 'light' ? '☀️ Day' : t === 'dark' ? '🌙 Night' : '🖥️ System'}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle-row">
          <div>
            <b>Four-colour deck</b>
            <div className="small muted">Clubs green and diamonds blue, so flushes jump out.</div>
          </div>
          <Toggle on={settings.fourColor} onChange={(v) => set('fourColor', v)} />
        </div>
        <div className="toggle-row">
          <div>
            <b>Sound effects</b>
            <div className="small muted">Soft chip clicks and chimes.</div>
          </div>
          <Toggle on={settings.sound} onChange={(v) => set('sound', v)} />
        </div>
        <div className="toggle-row">
          <div>
            <b>Reduce motion</b>
            <div className="small muted">No confetti, bobbing or card flips.</div>
          </div>
          <Toggle on={settings.reducedMotion} onChange={(v) => set('reducedMotion', v)} />
        </div>
      </div>

      <div className="panel">
        <h3>Training</h3>
        <div className="toggle-row">
          <div>
            <b>Streets</b>
            <div className="small muted">What Training deals: preflop charts, postflop spots (flop, turn and river), or everything mixed together.</div>
          </div>
          <div className="seg">
            {(['all', 'preflop', 'postflop'] as const).map((t) => (
              <button key={t} className={settings.focus === t ? 'on' : ''} onClick={() => set('focus', t)}>
                {t === 'all' ? 'Every street' : t === 'preflop' ? 'Preflop' : 'Postflop'}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
          <b>Seats</b>
          <div className="small muted" style={{ marginBottom: 6 }}>
            Fix your seat, the villain's, or both for Training and reviews. Drills, Blitz, Woodpecker and Range Sketch have their own seat choices.
          </div>
          <SeatPicker hero={settings.heroSeat} villain={settings.villainSeat} onChange={(h, v) => update({ heroSeat: h, villainSeat: v })} />
        </div>
        <div className="toggle-row">
          <div>
            <b>Theory guides</b>
            <div className="small muted">Markers for theoretical bluff %, MDF and pot odds on the live readout. "Auto" fades them out once you've mastered a spot family.</div>
          </div>
          <div className="seg">
            {(['auto', 'on', 'off'] as const).map((t) => (
              <button key={t} className={settings.hints === t ? 'on' : ''} onClick={() => set('hints', t)}>
                {t === 'auto' ? 'Auto' : t === 'on' ? 'Always' : 'Never'}
              </button>
            ))}
          </div>
        </div>
        <div className="toggle-row">
          <div>
            <b>Ask for confidence</b>
            <div className="small muted">Rate how sure you are when locking in. Powers calibration stats and brings back confident mistakes sooner.</div>
          </div>
          <Toggle on={settings.confidence} onChange={(v) => set('confidence', v)} />
        </div>
        <div className="toggle-row">
          <div>
            <b>Unlock everything</b>
            <div className="small muted">Skip the gradual unlocks of decision types, textures and villains.</div>
          </div>
          <Toggle on={settings.unlockAll} onChange={(v) => set('unlockAll', v)} />
        </div>
      </div>

      <div className="panel">
        <h3>Your data</h3>
        <p className="small muted">Everything lives in this browser's local storage. Export to back it up or move devices.</p>
        <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn secondary small" onClick={() => (setIo(exportData()), setMsg('Copy this text somewhere safe.'))}>
            Export
          </button>
          <button
            className="btn secondary small"
            onClick={() => {
              const ok = importData(io);
              setMsg(ok ? 'Imported! ✨' : "That doesn't look like a Range Den export.");
            }}
          >
            Import from box
          </button>
          <button
            className="btn berry small"
            onClick={() => {
              if (confirm('Erase all progress, garden, trophies and settings? This cannot be undone.')) {
                resetAll();
                setMsg('Fresh start.');
              }
            }}
          >
            Reset everything
          </button>
        </div>
        {msg && <div className="small" style={{ marginBottom: 6 }}>{msg}</div>}
        <textarea value={io} onChange={(e) => setIo(e.target.value)} placeholder="Exported data appears here; paste data here to import." />
      </div>
    </div>
  );
}
