import { useEffect, useMemo, useRef, useState } from 'react';
import { BUCKETS, bucketOf, rowSum, spotStats, type Strategy } from '../../engine/analysis';
import { NUM_CLASSES, classLabel, comboC1, comboC2, comboClass } from '../../engine/combos';
import { describeHand } from '../../engine/handinfo';
import type { SpotPackage } from '../../engine/types';
import { NONE_COLOR, actionColors, mixGradient, pct } from '../util';
import { ComboText } from './Cards';

export type GridMode = 'edit' | 'user' | 'ref' | 'gto' | 'villain' | 'diff';

interface Props {
  spot: SpotPackage;
  mode: GridMode;
  strategy?: Strategy;
  onStroke?: (members: number[], erase: boolean) => void;
  onStrokeEnd?: () => void;
  onInspect?: (cls: number) => void;
  inspectMode?: boolean;
  dealtCombo?: number;
  classLoss?: Float32Array;
  mini?: boolean;
}

interface Cell {
  empty: boolean;
  bg: string;
  fill: number;
}

export function RangeGrid({ spot, mode, strategy, onStroke, onStrokeEnd, onInspect, inspectMode, dealtCombo, classLoss, mini }: Props) {
  const stats = spotStats(spot);
  const gridRef = useRef<HTMLDivElement>(null);
  const painting = useRef<{ erase: boolean; seen: Set<number> } | null>(null);
  const [hover, setHover] = useState<{ cls: number; x: number; y: number } | null>(null);
  const nA = spot.actions.length;
  const colors = actionColors(spot);
  const editable = mode === 'edit';

  const source: Strategy | undefined = mode === 'ref' ? spot.solution.strategy : mode === 'gto' ? spot.solution.gtoStrategy : strategy;

  const cells: Cell[] = useMemo(() => {
    const out: Cell[] = [];
    const maxLoss = classLoss ? Math.max(1e-9, ...classLoss) : 1;
    for (let cls = 0; cls < NUM_CLASSES; cls++) {
      if (mode === 'villain') {
        const members = stats.villainClassMembers[cls];
        if (!members.length) {
          out.push({ empty: true, bg: '', fill: 0 });
          continue;
        }
        const shares = BUCKETS.map(() => 0);
        for (const j of members) shares[bucketOf(spot.villain.equity[j])] += spot.villain.weights[j];
        out.push({ empty: false, bg: mixGradient(BUCKETS.map((b) => b.color), shares), fill: stats.villainClassFill[cls] });
        continue;
      }
      const members = stats.classMembers[cls];
      if (!members.length) {
        out.push({ empty: true, bg: '', fill: 0 });
        continue;
      }
      if (mode === 'diff') {
        const loss = classLoss ? classLoss[cls] / maxLoss : 0;
        const bg = loss < 0.02 ? 'var(--sage-l)' : `color-mix(in srgb, var(--berry) ${Math.round(18 + 82 * loss)}%, var(--honey-l))`;
        out.push({ empty: false, bg, fill: stats.classFill[cls] });
        continue;
      }
      const agg = new Array(nA).fill(0);
      let none = 0;
      for (const k of members) {
        const w = spot.hero.weights[k];
        const sum = source ? rowSum(source, k, nA) : 0;
        if (sum <= 1e-9) none += w;
        else for (let a = 0; a < nA; a++) agg[a] += (w * source![k * nA + a]) / sum;
      }
      out.push({ empty: false, bg: mixGradient([...colors, NONE_COLOR], [...agg, none]), fill: stats.classFill[cls] });
    }
    // Normalise heights to the most-present class so low-reach ranges still read clearly.
    const maxFill = Math.max(1e-9, ...out.map((c) => (c.empty ? 0 : c.fill)));
    for (const c of out) c.fill = c.empty ? 0 : c.fill / maxFill;
    return out;
  }, [spot, mode, source, classLoss, stats, nA, colors.join()]);

  const dealtCls = dealtCombo != null ? comboClass[dealtCombo] : -1;

  const cellAt = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const c = el?.closest('[data-cls]') as HTMLElement | null;
    if (!c || !gridRef.current?.contains(c)) return -1;
    return Number(c.dataset.cls);
  };

  useEffect(() => {
    const end = () => {
      if (painting.current) {
        painting.current = null;
        onStrokeEnd?.();
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [onStrokeEnd]);

  const onPointerDown = (e: React.PointerEvent) => {
    const cls = cellAt(e.clientX, e.clientY);
    if (cls < 0) return;
    if (inspectMode || (!editable && onInspect)) {
      onInspect?.(cls);
      return;
    }
    if (!editable || !stats.classMembers[cls].length) return;
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const erase = e.button === 2 || e.altKey;
    painting.current = { erase, seen: new Set([cls]) };
    onStroke?.(stats.classMembers[cls], erase);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && !mini) {
      const cls = cellAt(e.clientX, e.clientY);
      setHover(cls >= 0 ? { cls, x: e.clientX, y: e.clientY } : null);
    }
    const p = painting.current;
    if (!p) return;
    const cls = cellAt(e.clientX, e.clientY);
    if (cls < 0 || p.seen.has(cls)) return;
    p.seen.add(cls);
    if (stats.classMembers[cls].length) onStroke?.(stats.classMembers[cls], p.erase);
  };

  return (
    <div className={`grid-wrap${mini ? ' grid-mini' : ''}`}>
      <div
        ref={gridRef}
        className={`grid13${editable ? '' : ' readonly'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => editable && e.preventDefault()}
      >
        {cells.map((c, cls) => (
          <div key={cls} data-cls={cls} className={`cell${c.empty ? ' empty' : ''}${cls === dealtCls ? ' dealt' : ''}${hover?.cls === cls && !c.empty ? ' hl' : ''}`}>
            {!c.empty && <div className="fill" style={{ height: `${Math.round((0.38 + 0.62 * Math.min(1, c.fill)) * 100)}%`, background: c.bg }} />}
            <div className="lbl">{classLabel(cls)}</div>
          </div>
        ))}
      </div>
      {hover && !cells[hover.cls].empty && <CellTip spot={spot} cls={hover.cls} x={hover.x} y={hover.y} mode={mode} source={source} />}
    </div>
  );
}

function CellTip({ spot, cls, x, y, mode, source }: { spot: SpotPackage; cls: number; x: number; y: number; mode: GridMode; source?: Strategy }) {
  const stats = spotStats(spot);
  const villain = mode === 'villain';
  const members = villain ? stats.villainClassMembers[cls] : stats.classMembers[cls];
  const view = villain ? spot.villain : spot.hero;
  const nA = spot.actions.length;
  const left = Math.min(x + 16, window.innerWidth - 300);
  const top = Math.min(y + 16, window.innerHeight - 40 - members.length * 22);
  return (
    <div className="cell-tip" style={{ left, top }}>
      <div className="row" style={{ marginBottom: 4 }}>
        <b className="num">{classLabel(cls)}</b>
        <span className="muted tiny">{villain ? "villain's combos · equity vs you" : 'your combos · equity vs villain'}</span>
      </div>
      {members.slice(0, 14).map((k) => {
        const id = view.combos[k];
        const d = describeHand(spot.board, comboC1[id], comboC2[id]);
        let mixText = '';
        if (!villain && source) {
          const sum = rowSum(source, k, nA);
          mixText = sum <= 1e-9 ? 'unassigned' : spot.actions.map((a, i) => (source[k * nA + i] / sum > 0.005 ? `${a.short} ${pct(source[k * nA + i] / sum)}` : '')).filter(Boolean).join(' · ');
        }
        return (
          <div key={k} className="combo-row" title={d.label}>
            <ComboText combo={id} />
            <span className="tiny" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.label}
              {mixText && <span className="muted"> — {mixText}</span>}
              {view.weights[k] < 0.98 && <span className="muted"> ({pct(view.weights[k])})</span>}
            </span>
            <span className="num tiny" style={{ textAlign: 'right' }}>
              {pct(view.equity[k])}
            </span>
          </div>
        );
      })}
      {members.length > 14 && <div className="muted tiny">+{members.length - 14} more</div>}
    </div>
  );
}
