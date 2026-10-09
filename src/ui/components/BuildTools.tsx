import { useMemo, useRef, useState } from 'react';
import { BUCKETS, bucketOf, rowSum, spotStats, type Strategy } from '../../engine/analysis';
import type { SpotPackage } from '../../engine/types';
import { ACTION_COLOR, NONE_COLOR, actionColors, mixGradient, pct } from '../util';

export interface Brush {
  primary: number;
  secondary: number | null;
  /** Share of the primary action when mixing. */
  split: number;
  erase: boolean;
}

export function brushMix(b: Brush, nA: number): number[] {
  const m = new Array(nA).fill(0);
  if (b.secondary == null || b.secondary === b.primary) m[b.primary] = 1;
  else {
    m[b.primary] = b.split;
    m[b.secondary] = 1 - b.split;
  }
  return m;
}

export function BrushBar({
  spot,
  brush,
  setBrush,
  onUndo,
  onRedo,
  onClear,
  onFill,
  canUndo,
  canRedo,
  inspect,
  setInspect,
}: {
  spot: SpotPackage;
  brush: Brush;
  setBrush: (b: Brush) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onFill: () => void;
  canUndo: boolean;
  canRedo: boolean;
  inspect: boolean;
  setInspect: (v: boolean) => void;
}) {
  const mixing = brush.secondary != null;
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="brushbar">
        {spot.actions.map((a, i) => {
          const on = !brush.erase && !inspect && (brush.primary === i || brush.secondary === i);
          return (
            <button
              key={i}
              className={`brush${on ? ' on' : ''}`}
              style={{ ['--c' as string]: ACTION_COLOR[a.key] }}
              onClick={(e) => {
                setInspect(false);
                if (e.shiftKey && i !== brush.primary) setBrush({ ...brush, secondary: i, erase: false });
                else setBrush({ primary: i, secondary: mixing && brush.secondary !== i ? brush.secondary : null, split: brush.split, erase: false });
              }}
              title={`${a.label} — press ${i + 1}; shift-click to mix`}
            >
              <span className="sw" />
              {a.short}
              <span className="kbd">{i + 1}</span>
            </button>
          );
        })}
        <button className={`brush${brush.erase && !inspect ? ' on' : ''}`} style={{ ['--c' as string]: NONE_COLOR }} onClick={() => (setInspect(false), setBrush({ ...brush, erase: true }))} title="Eraser (E) — or right-click / alt-drag">
          <span className="sw" style={{ background: 'repeating-linear-gradient(135deg, var(--line-2) 0 3px, transparent 3px 6px)' }} />
          Erase
          <span className="kbd">E</span>
        </button>
        <button className={`brush${inspect ? ' on' : ''}`} style={{ ['--c' as string]: 'var(--sky)' }} onClick={() => setInspect(!inspect)} title="Inspect a hand class to set suits individually (I)">
          🔍 Inspect
          <span className="kbd">I</span>
        </button>
      </div>
      <div className="row wrap" style={{ gap: 8 }}>
        {mixing ? (
          <div className="mixbox">
            <span style={{ fontWeight: 800 }}>Mix</span>
            <span className="tag" style={{ background: ACTION_COLOR[spot.actions[brush.primary].key] }}>
              {spot.actions[brush.primary].short} {Math.round(brush.split * 100)}%
            </span>
            <input type="range" min={10} max={90} step={5} value={Math.round(brush.split * 100)} onChange={(e) => setBrush({ ...brush, split: Number(e.target.value) / 100 })} />
            <span className="tag" style={{ background: ACTION_COLOR[spot.actions[brush.secondary!].key] }}>
              {spot.actions[brush.secondary!].short} {Math.round((1 - brush.split) * 100)}%
            </span>
            <button className="btn ghost small" onClick={() => setBrush({ ...brush, secondary: null })}>
              ✕
            </button>
          </div>
        ) : (
          <span className="muted small">
            Drag across the grid to paint · <b>shift-click</b> a second action to paint a mix · right-click erases
          </span>
        )}
        <div className="spacer" />
        <div className="tools">
          <button className="btn secondary small" onClick={onUndo} disabled={!canUndo} title="Undo (Z)">
            ↶
          </button>
          <button className="btn secondary small" onClick={onRedo} disabled={!canRedo} title="Redo (Y)">
            ↷
          </button>
          <button className="btn secondary small" onClick={onFill} title="Paint every unassigned hand with the current brush (F)">
            Fill rest
          </button>
          <button className="btn secondary small" onClick={onClear} title="Clear all">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

/** Your combos sorted strongest-first by equity vs villain's range; drag to paint a band. */
export function StrengthLadder({ spot, strategy, onPaint, showTheory }: { spot: SpotPackage; strategy: Strategy; onPaint: (members: number[], erase: boolean) => void; showTheory: boolean }) {
  const stats = spotStats(spot);
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ x0: number; x1: number; erase: boolean } | null>(null);
  const nA = spot.actions.length;
  const colors = actionColors(spot);
  const W = 1000;
  const H = 40;

  const layout = useMemo(() => {
    const total = stats.totalWeight;
    let x = 0;
    return stats.heroOrder.map((k) => {
      const w = (spot.hero.weights[k] / total) * W;
      const item = { k, x, w, eq: spot.hero.equity[k] };
      x += w;
      return item;
    });
  }, [spot, stats]);

  const markers = useMemo(() => {
    const out: { x: number; label: string }[] = [];
    for (const t of [0.75, 0.5, 0.25]) {
      const item = layout.find((it) => it.eq < t);
      if (item) out.push({ x: item.x, label: `${Math.round(t * 100)}%` });
    }
    return out;
  }, [layout]);

  const rects = useMemo(() => {
    const out: { x: number; y: number; w: number; h: number; c: string }[] = [];
    for (const it of layout) {
      const sum = rowSum(strategy, it.k, nA);
      if (sum <= 1e-9) {
        out.push({ x: it.x, y: 0, w: it.w + 0.3, h: H, c: NONE_COLOR });
        continue;
      }
      let y = 0;
      for (let a = 0; a < nA; a++) {
        const p = strategy[it.k * nA + a] / sum;
        if (p <= 0) continue;
        out.push({ x: it.x, y, w: it.w + 0.3, h: p * H, c: colors[a] });
        y += p * H;
      }
    }
    return out;
  }, [layout, strategy, nA, colors.join()]);

  const toX = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(W, ((clientX - r.left) / r.width) * W));
  };

  const finish = () => {
    if (!drag) return;
    const lo = Math.min(drag.x0, drag.x1);
    const hi = Math.max(drag.x0, drag.x1);
    const members = layout.filter((it) => it.x + it.w > lo && it.x < hi + 0.01).map((it) => it.k);
    if (members.length) onPaint(members, drag.erase);
    setDrag(null);
  };

  const selLo = drag ? Math.min(drag.x0, drag.x1) : 0;
  const selHi = drag ? Math.max(drag.x0, drag.x1) : 0;
  const selCombos = drag ? layout.filter((it) => it.x + it.w > selLo && it.x < selHi).reduce((s, it) => s + spot.hero.weights[it.k], 0) : 0;

  return (
    <div>
      <div
        ref={ref}
        className="ladder"
        onPointerDown={(e) => {
          e.preventDefault();
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const x = toX(e.clientX);
          setDrag({ x0: x, x1: x + 1, erase: e.button === 2 || e.altKey });
        }}
        onPointerMove={(e) => drag && setDrag({ ...drag, x1: toX(e.clientX) })}
        onPointerUp={finish}
        onPointerCancel={() => setDrag(null)}
        onContextMenu={(e) => e.preventDefault()}
        title="Drag to paint a band of hands by strength"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {rects.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.c} />
          ))}
          {showTheory &&
            markers.map((m) => <line key={m.label} x1={m.x} x2={m.x} y1={0} y2={H} stroke="var(--ink)" strokeWidth={2} strokeDasharray="3 3" opacity={0.55} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {drag && <div className="sel" style={{ left: `${(selLo / W) * 100}%`, width: `${((selHi - selLo) / W) * 100}%` }} />}
      </div>
      <div className="ladder-axis">
        <span>◀ strongest (beats villain's range)</span>
        {drag ? <b style={{ color: 'var(--ink)' }}>{selCombos.toFixed(1)} combos selected</b> : showTheory && <span>dashes: 75% · 50% · 25% equity</span>}
        <span>weakest ▶</span>
      </div>
    </div>
  );
}

export function CategoryPanel({ spot, strategy, onPaint }: { spot: SpotPackage; strategy: Strategy; onPaint: (members: number[]) => void }) {
  const stats = spotStats(spot);
  const [tab, setTab] = useState<'type' | 'strength'>('type');
  const nA = spot.actions.length;
  const colors = actionColors(spot);

  const groups = useMemo(() => {
    if (tab === 'type') return stats.categories.map((c) => ({ key: String(c.cat), label: c.label, members: c.members }));
    return BUCKETS.map((b, bi) => ({
      key: b.key,
      label: `${b.label} (${bi === 0 ? '90%+' : bi === 4 ? '<20%' : `${Math.round(b.min * 100)}%+`} eq)`,
      members: Array.from({ length: spot.hero.n }, (_, k) => k).filter((k) => bucketOf(spot.hero.equity[k]) === bi),
      color: b.color,
    })).filter((g) => g.members.length);
  }, [tab, spot, stats]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>Quick paint</h3>
        <div className="spacer" />
        <div className="seg">
          <button className={tab === 'type' ? 'on' : ''} onClick={() => setTab('type')}>
            Hand type
          </button>
          <button className={tab === 'strength' ? 'on' : ''} onClick={() => setTab('strength')}>
            Strength vs villain
          </button>
        </div>
      </div>
      <div className="cats">
        {groups.map((g) => {
          let weight = 0;
          const agg = new Array(nA).fill(0);
          let none = 0;
          for (const k of g.members) {
            const w = spot.hero.weights[k];
            weight += w;
            const sum = rowSum(strategy, k, nA);
            if (sum <= 1e-9) none += w;
            else for (let a = 0; a < nA; a++) agg[a] += (w * strategy[k * nA + a]) / sum;
          }
          const avgEq = g.members.reduce((s, k) => s + spot.hero.weights[k] * spot.hero.equity[k], 0) / Math.max(weight, 1e-9);
          return (
            <button key={g.key} className="cat-btn" onClick={() => onPaint(g.members)} title={`Paint all ${g.label} with the current brush`}>
              <div className="top">
                <span>{g.label}</span>
                <span className="muted num">{weight.toFixed(1)}</span>
              </div>
              <div className="mixbar">
                {agg.map((v, a) =>
                  v > 0 ? <div key={a} style={{ width: `${(v / weight) * 100}%`, background: colors[a] }} /> : null,
                )}
                {none > 0 && <div style={{ width: `${(none / weight) * 100}%`, background: NONE_COLOR }} />}
              </div>
              <span className="tiny muted">avg equity {pct(avgEq)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const mixBg = (spot: SpotPackage, mix: number[]) => mixGradient(actionColors(spot), mix);
