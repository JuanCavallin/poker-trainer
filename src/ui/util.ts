import type { ActionKey, SpotPackage } from '../engine/types';

export const ACTION_COLOR: Record<ActionKey, string> = {
  fold: 'var(--a-fold)',
  check: 'var(--a-check)',
  call: 'var(--a-call)',
  small: 'var(--a-small)',
  big: 'var(--a-big)',
  raise: 'var(--a-raise)',
  allin: 'var(--a-allin)',
};

export const NONE_COLOR = 'var(--a-none)';

export const pct = (x: number, digits = 0): string => (Number.isFinite(x) ? `${(x * 100).toFixed(digits)}%` : '–');
export const bb = (x: number, digits = 1): string => (Number.isFinite(x) ? `${x.toFixed(digits)}bb` : '–');
export const signed = (x: number, digits = 1): string => (x > 0 ? '+' : '') + x.toFixed(digits);

/** Horizontal hard-stop gradient for a mix of colours (weights need not sum to 1). */
export function mixGradient(colors: string[], weights: number[]): string {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (total <= 1e-9) return NONE_COLOR;
  let acc = 0;
  const stops: string[] = [];
  colors.forEach((c, i) => {
    const w = Math.max(0, weights[i]) / total;
    if (w <= 0) return;
    const a = (acc * 100).toFixed(2);
    acc += w;
    const b = (acc * 100).toFixed(2);
    stops.push(`${c} ${a}% ${b}%`);
  });
  return stops.length === 1 ? stops[0].split(' ')[0] : `linear-gradient(90deg, ${stops.join(', ')})`;
}

export const actionColors = (spot: SpotPackage): string[] => spot.actions.map((a) => ACTION_COLOR[a.key]);

export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'just now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return `${Math.floor(d / 86_400_000)}d ago`;
}

export const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
