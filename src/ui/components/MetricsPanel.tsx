import { useMemo } from 'react';
import { defaultActionIndex, liveMetrics, spotStats, type ActionMetric, type Strategy } from '../../engine/analysis';
import type { SpotPackage } from '../../engine/types';
import { actionColors, pct } from '../util';

function Gauge({ value, color, marks }: { value: number; color: string; marks: { at: number; label: string; ref?: boolean }[] }) {
  return (
    <div className="gauge" style={{ marginTop: marks.some((m) => m.label) ? 16 : 2 }}>
      <div className="bar" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, background: color }} />
      {marks.map((m, i) => (
        <span key={i}>
          <span className={`mark${m.ref ? ' ref' : ''}`} style={{ left: `${m.at * 100}%` }} />
          {m.label && (
            <span className="mark-label" style={{ left: `${Math.min(92, Math.max(8, m.at * 100))}%` }}>
              {m.label}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

function Verdict({ tone, children }: { tone: 'ok' | 'warn' | 'bad'; children: React.ReactNode }) {
  return <span className={`verdict ${tone}`}>{children}</span>;
}

function BluffMeter({ spot, m, showTheory: hints }: { spot: SpotPackage; m: ActionMetric; showTheory: boolean }) {
  const opt = spot.actions[m.index];
  const th = spot.theory.perAction[m.index];
  // The s/(1+2s) bluff ratio is a river idea: earlier, "bluffs" are semi-bluffs that still have outs.
  const river = spot.street === 'river';
  const showTheory = hints && river;
  const weak = river ? 'bluffs' : spot.street === 'preflop' ? 'light' : 'semi-bluffs/air';
  const color = actionColors(spot)[m.index];
  if (m.combos < 0.3) {
    return (
      <div className="metric">
        <div className="head">
          <span className="sw" style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
          {opt.short}
          <span className="val muted">unused</span>
        </div>
        {showTheory && th && <div className="sub">If you use it: ~{pct(th.bluffShare)} bluffs keeps villain indifferent · they must defend {pct(th.villainMdf)}</div>}
        {hints && !river && th && <div className="sub">Villain must defend {pct(th.villainMdf)} vs this size.</div>}
      </div>
    );
  }
  const diff = m.bluffShare - (th?.bluffShare ?? 0);
  const perTen = m.valueCombos > 0 ? (10 * m.bluffCombos) / m.valueCombos : Infinity;
  return (
    <div className="metric">
      <div className="head">
        <span style={{ width: 10, height: 10, borderRadius: 3, background: color, display: 'inline-block' }} />
        {opt.short}
        <span className="muted small">{pct(m.freq)} of range</span>
        <span className="val">
          {pct(m.bluffShare)} {weak}
        </span>
      </div>
      <Gauge value={m.bluffShare} color="var(--berry)" marks={showTheory && th ? [{ at: th.bluffShare, label: `theory ${pct(th.bluffShare)}` }] : []} />
      <div className="sub">
        <b className="num">{m.valueCombos.toFixed(1)}</b> ahead of their calls · <b className="num">{m.bluffCombos.toFixed(1)}</b> behind
        {Number.isFinite(perTen) && river && <> — {perTen.toFixed(1)} bluffs per 10 value hands</>}
      </div>
      {showTheory && th && (
        <div className="row wrap" style={{ gap: 6 }}>
          {Math.abs(diff) <= 0.06 ? (
            <Verdict tone="ok">⚖️ Close to balanced</Verdict>
          ) : diff > 0 ? (
            <Verdict tone="warn">🎈 Bluff-heavy: a caller profits by calling more</Verdict>
          ) : (
            <Verdict tone="warn">🧱 Value-heavy: a caller can fold more</Verdict>
          )}
          <span className="tiny muted">villain must defend {pct(th.villainMdf)} vs this size</span>
        </div>
      )}
    </div>
  );
}

export function MetricsPanel({ spot, strategy, showTheory }: { spot: SpotPackage; strategy: Strategy; showTheory: boolean }) {
  const m = useMemo(() => liveMetrics(spot, strategy), [spot, strategy]);
  const st = spotStats(spot);
  const colors = actionColors(spot);
  const def = spot.actions[defaultActionIndex(spot)];
  const th = spot.theory;

  return (
    <div className="panel">
      <div className="panel-title">
        <h3>📊 Live readout</h3>
        <div className="spacer" />
        <span className="muted small num">{m.total.toFixed(1)} combos</span>
      </div>

      <div className="metric">
        <div className="head">Your strategy</div>
        <div className="freqbar">
          {m.actions.map((a) =>
            a.freq > 0.001 ? (
              <div key={a.index} style={{ width: `${a.freq * 100}%`, background: colors[a.index] }} title={`${spot.actions[a.index].label}: ${pct(a.freq, 1)} (${a.combos.toFixed(1)} combos)`}>
                {a.freq >= 0.12 ? `${spot.actions[a.index].short} ${pct(a.freq)}` : a.freq >= 0.06 ? pct(a.freq) : ''}
              </div>
            ) : null,
          )}
        </div>
        <div className="sub">
          {m.unassigned > 0.05 ? (
            <>
              {m.unassigned.toFixed(1)} combos unassigned (counted as <b>{def.short}</b> until you paint them)
            </>
          ) : (
            'Every hand has an action ✓'
          )}
        </div>
      </div>

      {m.facing && (
        <>
          {spot.street === 'preflop' && showTheory && (
            <div className="sub" style={{ marginBottom: 6 }}>
              Preflop, MDF is only a rough guide: the other seats and how well each hand plays postflop matter too.
            </div>
          )}
          <div className="metric">
            <div className="head">
              🛡️ Defence
              <span className="val">{pct(m.continueFreq)}</span>
            </div>
            <Gauge value={m.continueFreq} color="var(--a-call)" marks={showTheory ? [{ at: th.mdf, label: `MDF ${pct(th.mdf)}` }] : []} />
            <div className="sub">
              Calling needs <b>{pct(th.requiredEquity)}</b> equity (pot odds). Your continuing hands average <b>{pct(m.continueEquity)}</b> vs their whole range.
            </div>
            {showTheory &&
              (m.continueFreq < th.mdf - 0.07 ? (
                <Verdict tone="warn">🐢 Over-folding: any two cards would profit as a bluff</Verdict>
              ) : m.continueFreq > th.mdf + 0.18 ? (
                <Verdict tone="warn">🎣 Defending very wide — only right if villain over-bluffs</Verdict>
              ) : (
                <Verdict tone="ok">✓ Near minimum defence</Verdict>
              ))}
          </div>
          <div className="metric">
            <div className="head">
              🦊 Villain's {spot.street === 'preflop' ? 'raise' : 'bet'}
              <span className="val">
                {pct(st.villainBluffShare)} {spot.street === 'river' ? 'bluffs' : 'behind'}
              </span>
            </div>
            <Gauge
              value={st.villainBluffShare}
              color="var(--b-air)"
              marks={showTheory && spot.street === 'river' ? [{ at: th.villainBluffShare, label: `balanced ≈${pct(th.villainBluffShare)}` }] : []}
            />
            <div className="sub">
              {spot.street === 'river'
                ? `Share of their betting range that loses to most of your range. A ${pct(th.villainBetFrac)}-pot bet is balanced near ${pct(th.villainBluffShare)} bluffs.`
                : 'Share of their range that is behind your average hand right now. Before the river many of these still have outs, so expect more of them than on the river.'}
            </div>
            {showTheory &&
              spot.street === 'river' &&
              (st.villainBluffShare > th.villainBluffShare + 0.08 ? (
                <Verdict tone="warn">🎯 Looks over-bluffed: bluff-catchers gain value</Verdict>
              ) : st.villainBluffShare < th.villainBluffShare - 0.08 ? (
                <Verdict tone="warn">🧱 Looks value-heavy: fold more bluff-catchers</Verdict>
              ) : (
                <Verdict tone="ok">⚖️ Roughly balanced</Verdict>
              ))}
          </div>
        </>
      )}

      {m.actions
        .filter((a) => spot.actions[a.index].aggressive)
        .map((a) => (
          <BluffMeter key={a.index} spot={spot} m={a} showTheory={showTheory} />
        ))}

      <div className="metric">
        <div className="head">🏔️ Range advantage</div>
        <div className="sub" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Equity</span>
          <span>
            You <b>{pct(st.heroEquity)}</b> · Villain <b>{pct(st.villainEquity)}</b>
          </span>
        </div>
        <div className="tug">
          <div style={{ width: `${st.heroEquity * 100}%`, background: 'var(--sage)' }} />
          <div style={{ flex: 1, background: 'var(--b-air)' }} />
        </div>
        <div className="sub" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span>{spot.street === 'preflop' ? 'Premium hands (top 10%)' : 'Nut hands (top 10% made hands)'}</span>
          <span>
            You <b>{pct(st.heroNutShare)}</b> · Villain <b>{pct(st.villainNutShare)}</b>
          </span>
        </div>
        <div className="tug">
          <div style={{ flex: Math.max(0.02, st.heroNutShare), background: 'var(--b-nuts)' }} />
          <div style={{ flex: Math.max(0.02, st.villainNutShare), background: 'var(--b-air)' }} />
        </div>
        {showTheory && (
          <div className="sub" style={{ marginTop: 4 }}>
            {st.heroNutShare > st.villainNutShare + 0.05
              ? '💪 You hold more of the nuts: big bets and overbets can work.'
              : st.villainNutShare > st.heroNutShare + 0.05
                ? '⚠️ Villain holds more nut hands: be careful with big bets and thin raises.'
                : 'Nut hands are about even between the ranges.'}
          </div>
        )}
      </div>

      {spot.nodeType === 'oop-first' && spot.street !== 'preflop' && Number.isFinite(m.checkStrongShare) && (
        <div className="metric">
          <div className="head">
            🧺 Checking-range protection
            <span className="val">{pct(m.checkStrongShare)}</span>
          </div>
          <div className="sub">Share of your checks that are strong (70%+ equity). With none, villain can bet any two cards when you check.</div>
          {showTheory && m.checkStrongShare < 0.06 && m.actions.some((a) => spot.actions[a.index].key === 'check' && a.freq > 0.25) && (
            <Verdict tone="warn">Your checks look capped</Verdict>
          )}
        </div>
      )}
    </div>
  );
}
