import { useState } from 'react';
import { STREET_LABEL, type SpotRequest, type Street } from '../../engine/types';
import { familyLabel, requestFamily, unlockedFamilies, type SeatPref } from '../../learning/families';
import { levelFromXp } from '../../learning/progress';
import { requestForFamily } from '../../learning/selector';
import { useStore } from '../../state/store';
import type { WoodpeckerSet } from '../../state/types';
import { LineChart } from '../components/Charts';
import { SeatPicker, seatOrUndefined, type Seat } from '../components/SeatPicker';
import { useNav } from '../nav';
import { formatMs, timeAgo } from '../util';

type Source = 'weak' | 'random' | 'facing' | 'betting';
type SetStreet = Street | 'postflop';

const SET_STREETS: SetStreet[] = ['preflop', 'flop', 'turn', 'river', 'postflop'];
const setStreetLabel = (s: SetStreet) => (s === 'postflop' ? 'Mixed postflop' : STREET_LABEL[s]);

function buildSpots(size: number, source: Source, street: SetStreet, seats: SeatPref | undefined): SpotRequest[] {
  const s = useStore.getState();
  const streets: Street[] = street === 'postflop' ? ['flop', 'turn', 'river'] : [street];
  const level = levelFromXp(s.xp).level;
  let fams = unlockedFamilies(level, s.settings.unlockAll, streets, seats);
  const facing = (f: string) => /vs-bet|vs-open|vs-3bet|vs-4bet/.test(f);
  if (source === 'facing') fams = fams.filter(facing);
  if (source === 'betting') fams = fams.filter((f) => !facing(f));
  if (source === 'weak') fams = [...fams].sort((a, b) => (s.families[a]?.mastery ?? 0.4) - (s.families[b]?.mastery ?? 0.4)).slice(0, Math.max(3, Math.ceil(size / 3)));
  if (!fams.length) fams = unlockedFamilies(level, true, streets, seats);
  if (!fams.length) fams = unlockedFamilies(level, true, streets);
  return Array.from({ length: size }, (_, i) => requestForFamily(fams[i % fams.length], 'gto', seats));
}

const shuffled = (n: number) => {
  const p = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  return p;
};

export function Woodpecker() {
  const go = useNav((s) => s.go);
  const sets = useStore((s) => s.woodpecker);
  const add = useStore((s) => s.addWoodpecker);
  const update = useStore((s) => s.updateWoodpecker);
  const remove = useStore((s) => s.deleteWoodpecker);
  const [size, setSize] = useState(12);
  const [source, setSource] = useState<Source>('weak');
  const [street, setStreet] = useState<SetStreet>('preflop');
  const [mode, setMode] = useState<'mirror' | 'exact'>('exact');
  const [hero, setHero] = useState<Seat>('any');
  const [villain, setVillain] = useState<Seat>('any');

  const pickStreet = (s: SetStreet) => {
    setStreet(s);
    setMode(s === 'preflop' ? 'exact' : 'mirror');
  };

  const create = () => {
    const seats = hero === 'any' && villain === 'any' ? undefined : { hero: seatOrUndefined(hero), villain: seatOrUndefined(villain) };
    const ws: WoodpeckerSet = {
      id: `wp-${Date.now().toString(36)}`,
      name: `${setStreetLabel(street)} set ${sets.filter((w) => (w.street ?? 'river') === street).length + 1}`,
      createdAt: Date.now(),
      mode,
      street,
      spots: buildSpots(size, source, street, seats),
      cycles: [],
    };
    add(ws);
  };

  const startCycle = (ws: WoodpeckerSet) => {
    const last = ws.cycles[ws.cycles.length - 1];
    if (!last || last.finishedAt) {
      update(ws.id, (w) => ({ ...w, cycles: [...w.cycles, { startedAt: Date.now(), perm: shuffled(w.spots.length), results: [] }] }));
    }
    go('train', { kind: 'woodpecker', setId: ws.id });
  };

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #7fae8a, #4f8f7a 55%, #3d6f7a)' }}>
        <span className="deco">🐦</span>
        <h1>Woodpecker cycles</h1>
        <p>
          Chess players drill a fixed puzzle set over and over, each cycle faster (Smith &amp; Tikkanen's <i>Woodpecker Method</i>). It fits <b>preflop</b> best: there are only 169 hands
          and a handful of seats, and the same situation always has the same answer, which is exactly when repetition turns slow reasoning into instant recall. Postflop patterns are
          more abstract, so postflop sets reshuffle suits every cycle: strategically the same spot, visually new.
        </p>
      </div>

      <div className="panel">
        <h2>🌰 New set</h2>
        <div className="row wrap" style={{ gap: 18, alignItems: 'flex-start' }}>
          <div className="field">
            <label>Street</label>
            <div className="seg">
              {SET_STREETS.map((s) => (
                <button key={s} className={street === s ? 'on' : ''} onClick={() => pickStreet(s)}>
                  {setStreetLabel(s)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Size</label>
            <div className="seg">
              {[8, 12, 20].map((n) => (
                <button key={n} className={size === n ? 'on' : ''} onClick={() => setSize(n)}>
                  {n} spots
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Built from</label>
            <div className="seg">
              <button className={source === 'weak' ? 'on' : ''} onClick={() => setSource('weak')}>
                My weakest families
              </button>
              <button className={source === 'random' ? 'on' : ''} onClick={() => setSource('random')}>
                Anything
              </button>
              <button className={source === 'facing' ? 'on' : ''} onClick={() => setSource('facing')}>
                Facing bets
              </button>
              <button className={source === 'betting' ? 'on' : ''} onClick={() => setSource('betting')}>
                Betting spots
              </button>
            </div>
          </div>
          <div className="field">
            <label>Repeats</label>
            <div className="seg">
              <button className={mode === 'mirror' ? 'on' : ''} onClick={() => setMode('mirror')} disabled={street === 'preflop'}>
                🪞 Mirror{street !== 'preflop' ? ' (recommended)' : ''}
              </button>
              <button className={mode === 'exact' ? 'on' : ''} onClick={() => setMode('exact')}>
                📋 Exact{street === 'preflop' ? ' (recommended)' : ''}
              </button>
            </div>
            <span className="small muted" style={{ maxWidth: 360 }}>
              {street === 'preflop'
                ? 'Suits don’t change a preflop chart, so every repeat is the real thing. Identical, spaced repetition is how fixed facts become automatic.'
                : 'Mirror keeps the strategy and changes the suits, so you learn the pattern rather than the picture.'}
            </span>
          </div>
        </div>
        <SeatPicker
          hero={hero}
          villain={villain}
          onChange={(h, v) => {
            setHero(h);
            setVillain(v);
          }}
        />
        <button className="btn" onClick={create}>
          Create set
        </button>
      </div>

      {sets.length === 0 && <div className="empty panel">No sets yet. Create one above and run your first cycle.</div>}

      {sets.map((ws) => {
        const done = ws.cycles.filter((c) => c.finishedAt);
        const last = ws.cycles[ws.cycles.length - 1];
        const inProgress = last && !last.finishedAt;
        const lastDone = done[done.length - 1];
        const lastTime = lastDone ? lastDone.results.reduce((s, r) => s + r.ms, 0) : 0;
        const lastAvg = lastDone ? lastDone.results.reduce((s, r) => s + r.score, 0) / lastDone.results.length : 0;
        const rested = !lastDone?.finishedAt || Date.now() - lastDone.finishedAt > 20 * 3_600_000;
        const fams = [...new Set(ws.spots.map((s) => requestFamily(s)).filter((x): x is string => !!x))];
        return (
          <div key={ws.id} className="panel">
            <div className="panel-title">
              <h3>
                🐦 {ws.name}{' '}
                <span className="muted small">
                  · {setStreetLabel(ws.street ?? 'river')} · {ws.spots.length} spots · {ws.mode === 'mirror' ? 'mirror' : 'exact'} · created {timeAgo(ws.createdAt)}
                </span>
              </h3>
              <div className="spacer" />
              <button className="btn ghost small" onClick={() => confirm('Delete this set?') && remove(ws.id)}>
                🗑️
              </button>
            </div>
            <div className="row wrap" style={{ gap: 6, marginBottom: 10 }}>
              {fams.slice(0, 6).map((f) => (
                <span key={f} className="tag">
                  {familyLabel(f).full}
                </span>
              ))}
            </div>
            {done.length > 0 && (
              <>
                <table className="compare-table">
                  <thead>
                    <tr>
                      <th>Cycle</th>
                      <th>Finished</th>
                      <th>Avg score</th>
                      <th>Total time</th>
                      <th>Per spot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {done.map((c, i) => {
                      const t = c.results.reduce((s, r) => s + r.ms, 0);
                      const a = c.results.reduce((s, r) => s + r.score, 0) / c.results.length;
                      return (
                        <tr key={i}>
                          <td>#{i + 1}</td>
                          <td>{timeAgo(c.finishedAt!)}</td>
                          <td className="num">{a.toFixed(0)}</td>
                          <td className="num">{formatMs(t)}</td>
                          <td className="num">{formatMs(t / c.results.length)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {done.length > 1 && (
                  <LineChart
                    height={130}
                    series={[
                      { label: 'Score', color: 'var(--sage)', values: done.map((c) => c.results.reduce((s, r) => s + r.score, 0) / c.results.length) },
                      {
                        label: 'Seconds per spot',
                        color: 'var(--terracotta)',
                        values: done.map((c) => Math.min(100, c.results.reduce((s, r) => s + r.ms, 0) / c.results.length / 1000)),
                      },
                    ]}
                    labels={['cycle 1', `cycle ${done.length}`]}
                  />
                )}
              </>
            )}
            <div className="row wrap" style={{ marginTop: 10, gap: 10 }}>
              <button className="btn sage" onClick={() => startCycle(ws)}>
                {inProgress ? `▶ Resume cycle ${ws.cycles.length} (${last.results.length}/${ws.spots.length})` : `▶ Start cycle ${done.length + 1}`}
              </button>
              {lastDone && !inProgress && (
                <span className="small muted">
                  Target: score ≥ {lastAvg.toFixed(0)} in ≤ {formatMs(lastTime / 2)} total.
                  {!rested && ' Resting until tomorrow first helps it stick (spacing effect).'}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
