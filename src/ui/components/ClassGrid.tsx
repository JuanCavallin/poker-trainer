import { useEffect, useRef } from 'react';
import { NUM_CLASSES, classLabel } from '../../engine/combos';

interface Props {
  /** Bar height per hand class (0..1). */
  values: ArrayLike<number>;
  /** Fill colour: one for every class, or one per class (CSS backgrounds). */
  color: string | string[];
  /** A previous range shown as an outline, so you can see what changed (0..1 per class). */
  ghost?: ArrayLike<number>;
  /** Classes with no live combos on this board. */
  blocked?: boolean[];
  /** Paint a class while dragging (erase with right-click or alt). */
  onPaint?: (cls: number, erase: boolean) => void;
  onStrokeEnd?: () => void;
  onHover?: (cls: number | null) => void;
  mini?: boolean;
  dealtCls?: number;
}

/** A 13x13 hand-class grid of frequencies, optionally paintable. */
export function ClassGrid({ values, color, ghost, blocked, onPaint, onStrokeEnd, onHover, mini, dealtCls }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const stroke = useRef<{ erase: boolean; seen: Set<number> } | null>(null);
  const editable = !!onPaint;

  useEffect(() => {
    const end = () => {
      if (stroke.current) {
        stroke.current = null;
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

  const cellAt = (x: number, y: number): number => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const c = el?.closest('[data-cls]') as HTMLElement | null;
    if (!c || !ref.current?.contains(c)) return -1;
    return Number(c.dataset.cls);
  };

  return (
    <div className={`grid-wrap${mini ? ' grid-mini' : ''}`}>
      <div
        ref={ref}
        className={`grid13${editable ? '' : ' readonly'}`}
        onPointerDown={(e) => {
          if (!editable) return;
          const cls = cellAt(e.clientX, e.clientY);
          if (cls < 0 || blocked?.[cls]) return;
          e.preventDefault();
          (e.target as Element).releasePointerCapture?.(e.pointerId);
          const erase = e.button === 2 || e.altKey;
          stroke.current = { erase, seen: new Set([cls]) };
          onPaint!(cls, erase);
        }}
        onPointerMove={(e) => {
          if (onHover && e.pointerType === 'mouse') {
            const cls = cellAt(e.clientX, e.clientY);
            onHover(cls >= 0 ? cls : null);
          }
          const s = stroke.current;
          if (!s) return;
          const cls = cellAt(e.clientX, e.clientY);
          if (cls < 0 || s.seen.has(cls) || blocked?.[cls]) return;
          s.seen.add(cls);
          onPaint!(cls, s.erase);
        }}
        onPointerLeave={() => onHover?.(null)}
        onContextMenu={(e) => editable && e.preventDefault()}
      >
        {Array.from({ length: NUM_CLASSES }, (_, cls) => {
          const v = Math.max(0, Math.min(1, values[cls] ?? 0));
          const g = ghost ? Math.max(0, Math.min(1, ghost[cls] ?? 0)) : 0;
          const bg = typeof color === 'string' ? color : color[cls];
          const empty = !!blocked?.[cls];
          return (
            <div
              key={cls}
              data-cls={cls}
              className={`cell${empty ? ' empty' : ''}${cls === dealtCls ? ' dealt' : ''}`}
              style={g > 0.02 && !empty ? { boxShadow: `inset 0 0 0 2px color-mix(in srgb, var(--ink) ${Math.round(20 + 45 * g)}%, transparent)` } : undefined}
            >
              {!empty && v > 0.001 && <div className="fill" style={{ height: `${Math.round(v * 100)}%`, background: bg }} />}
              <div className="lbl">{classLabel(cls)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
