import { useMemo, useState } from 'react';
import { FINDS, type FindId, type Tendencies } from '../../engine/analysis';
import { PROFILES, type ProfileId } from '../../engine/profiles';
import { NODE_TYPE_INFO, STREETS, STREET_LABEL, familyKey, nodeTypesFor, type Street } from '../../engine/types';
import { columnLabel, columnsFor } from '../../learning/families';
import { levelFromXp, titleFor } from '../../learning/progress';
import { useStore } from '../../state/store';
import type { AttemptRecord } from '../../state/types';
import { LineChart } from '../components/Charts';
import { useNav } from '../nav';
import { pct } from '../util';

const TUNERS: { key: keyof Tendencies; label: string; left: string; right: string; scale: number; facing?: boolean }[] = [
  { key: 'aggr', label: 'Aggression', left: 'Too passive', right: 'Too aggressive', scale: 0.3 },
  { key: 'bluff', label: 'Bluffing', left: 'Under-bluffs', right: 'Over-bluffs', scale: 0.3 },
  { key: 'defense', label: 'Defence vs bets', left: 'Over-folds', right: 'Over-calls', scale: 0.3, facing: true },
  { key: 'raise', label: 'Raising vs bets', left: 'Raises too little', right: 'Raises too much', scale: 0.2, facing: true },
  { key: 'sizing', label: 'Bet sizing', left: 'Sizes too small', right: 'Sizes too big', scale: 0.5 },
  { key: 'thin', label: 'Thin value', left: 'Misses thin value', right: 'Bets too thin', scale: 0.5 },
];

function avgOf(recs: AttemptRecord[], key: keyof Tendencies): { v: number; n: number } {
  const vals = recs.map((r) => r.tendencies[key]).filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  return { v: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN, n: vals.length };
}

function rolling(values: number[], w: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const s = values.slice(Math.max(0, i - w + 1), i + 1);
    out.push(s.reduce((a, b) => a + b, 0) / s.length);
  }
  return out;
}

export function Progress() {
  const go = useNav((s) => s.go);
  const history = useStore((s) => s.history);
  const xp = useStore((s) => s.xp);
  const counters = useStore((s) => s.counters);
  const families = useStore((s) => s.families);
  const lv = levelFromXp(xp);

  const chrono = useMemo(() => history.slice(0, 200).reverse(), [history]);
  const recent = history.slice(0, 25);
  const before = history.slice(25, 50);

  const firstEv = history.slice(-20);
  const lastEv = history.slice(0, 20);
  const evA = firstEv.length ? firstEv.reduce((s, r) => s + r.evLossPct, 0) / firstEv.length : NaN;
  const evB = lastEv.length ? lastEv.reduce((s, r) => s + r.evLossPct, 0) / lastEv.length : NaN;

  const capture = useMemo(() => {
    const out: { p: ProfileId; v: number; n: number }[] = [];
    for (const p of ['station', 'nit', 'fox', 'maniac'] as ProfileId[]) {
      const vals = history
        .filter((r) => r.profile === p && r.capture != null)
        .slice(0, 15)
        .map((r) => r.capture as number);
      out.push({ p, v: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN, n: vals.length });
    }
    return out;
  }, [history]);

  const calib = useMemo(
    () =>
      (['unsure', 'fair', 'sure'] as const).map((c) => {
        const recs = history.filter((r) => r.confidence === c).slice(0, 60);
        return { c, n: recs.length, good: recs.length ? recs.filter((r) => r.score >= 75).length / recs.length : NaN, avg: recs.length ? recs.reduce((s, r) => s + r.score, 0) / recs.length : NaN };
      }),
    [history],
  );

  const bluffSel = avgOf(recent, 'bluffSel');
  const [mapStreet, setMapStreet] = useState<Street>('river');
  const byStreet = STREETS.map((st) => {
    const recs = history.filter((r) => (r.street ?? 'river') === st).slice(0, 25);
    return { st, n: recs.length, avg: recs.length ? recs.reduce((a, r) => a + r.score, 0) / recs.length : NaN };
  });

  if (!history.length)
    return (
      <div className="col" style={{ gap: 18 }}>
        <h1>📈 Progress</h1>
        <div className="panel empty">
          <p>Play a few spots and your trends will grow here: scores, tendencies, exploit skill, calibration and speed.</p>
          <button className="btn" onClick={() => go('train', { kind: 'regular' })}>
            Deal a spot
          </button>
        </div>
      </div>
    );

  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h1>📈 Progress</h1>
        <p className="muted">
          Level {lv.level} · {titleFor(lv.level)} · {counters.spots} spots played
        </p>
      </div>

      <div className="statgrid">
        <div className="stat-tile">
          <div className="k">Avg score (last 25)</div>
          <div className="v">{(recent.reduce((s, r) => s + r.score, 0) / recent.length).toFixed(0)}</div>
          {before.length > 4 && (
            <div className={`d ${recent.reduce((s, r) => s + r.score, 0) / recent.length >= before.reduce((s, r) => s + r.score, 0) / before.length ? 'up' : 'down'}`}>
              vs {(before.reduce((s, r) => s + r.score, 0) / before.length).toFixed(0)} before
            </div>
          )}
        </div>
        <div className="stat-tile" title="Average EV given up per hand, as a share of the pot">
          <div className="k">EV leak per hand</div>
          <div className="v">{Number.isFinite(evB) ? `${evB.toFixed(1)}%` : '–'}</div>
          {history.length >= 40 && Number.isFinite(evA) && <div className={`d ${evB <= evA ? 'up' : 'down'}`}>started at {evA.toFixed(1)}% of pot</div>}
        </div>
        <div className="stat-tile">
          <div className="k">Bluff picking</div>
          <div className="v">{Number.isFinite(bluffSel.v) ? pct(bluffSel.v) : '–'}</div>
          <div className="d muted">of your bluffs the solver likes too</div>
        </div>
        <div className="stat-tile">
          <div className="k">Highlights</div>
          <div className="v">{Object.values(counters.finds).reduce((a, b) => a + (b ?? 0), 0)}</div>
          <div className="d muted">hero calls, brave bluffs…</div>
        </div>
      </div>

      <div className="panel">
        <h3>Scores over time</h3>
        <LineChart
          series={[
            { label: 'Range score', color: 'var(--honey)', values: rolling(chrono.map((r) => r.score), 8) },
            { label: 'Hand-by-hand', color: 'var(--sage)', values: rolling(chrono.map((r) => r.accuracy), 8) },
          ]}
          refLine={{ y: 85, label: 'sweet spot ~85' }}
          labels={['older', 'recent']}
        />
        <div className="legend">
          <span>
            <i style={{ background: 'var(--honey)' }} />
            Range score (8-spot average)
          </span>
          <span>
            <i style={{ background: 'var(--sage)' }} />
            Hand-by-hand accuracy
          </span>
        </div>
      </div>

      <div className="home" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="panel">
          <h3>🎛️ Tendency tuner</h3>
          <p className="small muted">Your last 25 spots compared with the reference play. Centre is perfect; the faint dot is where you were before.</p>
          <div className="tuner">
            {TUNERS.map((t) => {
              const now = avgOf(recent, t.key);
              const prev = avgOf(before, t.key);
              if (!now.n)
                return (
                  <div key={t.key} className="tuner-row">
                    <div className="labels">
                      <span>{t.left}</span>
                      <b>{t.label}</b>
                      <span>{t.right}</span>
                    </div>
                    <div className="small muted">Not enough {t.facing ? 'facing-bet ' : ''}spots yet</div>
                  </div>
                );
              const pos = (v: number) => 50 + 50 * Math.max(-1, Math.min(1, v / t.scale));
              const improving = prev.n > 3 && Math.abs(now.v) < Math.abs(prev.v);
              return (
                <div key={t.key} className="tuner-row">
                  <div className="labels">
                    <span>{t.left}</span>
                    <b>
                      {t.label} {improving && <span className="up">▲ improving</span>}
                    </b>
                    <span>{t.right}</span>
                  </div>
                  <div className="tuner-track">
                    <div className="center" />
                    {prev.n > 3 && <div className="ghost" style={{ left: `${pos(prev.v)}%` }} />}
                    <div className="dot" style={{ left: `${pos(now.v)}%` }} />
                  </div>
                  <div className="tiny muted" style={{ textAlign: 'center', marginTop: 2 }}>
                    {now.v > 0 ? '+' : ''}
                    {(now.v * 100).toFixed(0)} pts vs reference · {now.n} spots
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="col" style={{ gap: 18 }}>
          <div className="panel">
            <h3>🐾 Exploit radar</h3>
            <p className="small muted">Share of the extra value available against each villain that you captured (0% = played equilibrium, 100% = perfect exploit).</p>
            {capture.map(({ p, v, n }) => (
              <div key={p} style={{ margin: '10px 0' }}>
                <div className="row small">
                  <span style={{ fontSize: '1.2rem' }}>{PROFILES[p].emoji}</span>
                  <b>{PROFILES[p].name}</b>
                  <span className="spacer" />
                  <span className="num">{n ? pct(Math.max(0, v)) : 'not met yet'}</span>
                </div>
                <div className="progress sage">
                  <div style={{ width: `${n ? Math.max(0, Math.min(1, v)) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="panel">
            <h3>🎯 Confidence calibration</h3>
            <p className="small muted">How often each confidence level ends in a strong range (75+). Good calibration means "certain" really is right most of the time.</p>
            <table className="compare-table">
              <thead>
                <tr>
                  <th>When you felt…</th>
                  <th>Spots</th>
                  <th>75+</th>
                  <th>Avg</th>
                </tr>
              </thead>
              <tbody>
                {calib.map((c) => (
                  <tr key={c.c}>
                    <td>{c.c === 'unsure' ? '🤔 Guessing' : c.c === 'fair' ? '🙂 Fairly sure' : '😎 Certain'}</td>
                    <td className="num">{c.n}</td>
                    <td className="num">{pct(c.good)}</td>
                    <td className="num">{Number.isFinite(c.avg) ? c.avg.toFixed(0) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {calib[2].n >= 5 && calib[2].good < 0.6 && <div className="verdict warn" style={{ marginTop: 8 }}>A bit overconfident: "certain" spots score 75+ only {pct(calib[2].good)} of the time.</div>}
            {calib[0].n >= 5 && calib[0].good > 0.7 && <div className="verdict ok" style={{ marginTop: 8 }}>Underconfident: you're right more often than you think.</div>}
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>🛤️ By street</h3>
        <p className="small muted">Average score over your last 25 spots on each street.</p>
        <div className="statgrid">
          {byStreet.map((b) => (
            <div key={b.st} className="stat-tile">
              <div className="k">{STREET_LABEL[b.st]}</div>
              <div className="v">{Number.isFinite(b.avg) ? b.avg.toFixed(0) : '–'}</div>
              <div className="d muted">{b.n ? `${b.n} recent spot${b.n === 1 ? '' : 's'}` : 'not played yet'}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <h3>🗺️ Mastery map</h3>
          <div className="spacer" />
          <div className="seg">
            {STREETS.map((st) => (
              <button key={st} className={mapStreet === st ? 'on' : ''} onClick={() => setMapStreet(st)}>
                {STREET_LABEL[st]}
              </button>
            ))}
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="compare-table">
            <thead>
              <tr>
                <th>Decision</th>
                {columnsFor(mapStreet).map((t) => (
                  <th key={t}>{columnLabel(mapStreet, t)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodeTypesFor(mapStreet).map((n) => (
                <tr key={n}>
                  <td>{NODE_TYPE_INFO[n].short}</td>
                  {columnsFor(mapStreet).map((t) => {
                    const f = families[familyKey(mapStreet, n, t)];
                    const m = f?.reps ? f.mastery : NaN;
                    return (
                      <td key={t} className="num" style={{ background: Number.isFinite(m) ? `color-mix(in srgb, var(--sage) ${Math.round(m * 70)}%, transparent)` : undefined }}>
                        {Number.isFinite(m) ? pct(m) : '·'}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="home" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' }}>
        <div className="panel">
          <h3>⏱️ Fluency</h3>
          <p className="small muted">Seconds per range build. Faster at the same accuracy means the patterns are becoming automatic.</p>
          <LineChart series={[{ label: 'Seconds', color: 'var(--terracotta)', values: rolling(chrono.map((r) => Math.min(240, r.ms / 1000)), 8) }]} lo={0} hi={Math.max(60, ...chrono.map((r) => Math.min(240, r.ms / 1000)))} labels={['older', 'recent']} />
        </div>
        <div className="panel">
          <h3>📸 Highlight counts</h3>
          {(Object.keys(FINDS) as FindId[]).map((f) => (
            <div key={f} className="row small" style={{ padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
              <span>{FINDS[f].emoji}</span>
              <span>{FINDS[f].title}</span>
              <span className="spacer" />
              <b className="num">{counters.finds[f] ?? 0}</b>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
