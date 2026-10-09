import type { ReactNode } from 'react';

export function Ring({ value, size = 108, stroke = 10, color = 'var(--honey)', track = 'var(--bg-2)', children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * v} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
        />
      </svg>
      <div className="inner">{children}</div>
    </div>
  );
}

export const scoreColor = (s: number) => (s >= 90 ? 'var(--gold)' : s >= 75 ? 'var(--sage)' : s >= 55 ? 'var(--honey)' : 'var(--berry)');

export function Stars({ n }: { n: number }) {
  return (
    <span className="stars">
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < n ? '' : 'off'}>
          ⭐
        </span>
      ))}
    </span>
  );
}

/** Simple line chart with optional reference line; values in [lo, hi]. */
export function LineChart({
  series,
  height = 160,
  lo = 0,
  hi = 100,
  refLine,
  labels,
}: {
  series: { values: number[]; color: string; label: string }[];
  height?: number;
  lo?: number;
  hi?: number;
  refLine?: { y: number; label: string };
  labels?: string[];
}) {
  const W = 600;
  const H = height;
  const pad = { l: 30, r: 10, t: 10, b: 20 };
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const x = (i: number) => pad.l + (i / (n - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  const grid = [lo, (lo + hi) / 2, hi];
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img">
      {grid.map((g) => (
        <g key={g}>
          <line x1={pad.l} x2={W - pad.r} y1={y(g)} y2={y(g)} stroke="var(--line)" strokeDasharray="3 4" />
          <text x={pad.l - 6} y={y(g) + 3} textAnchor="end">
            {Math.round(g)}
          </text>
        </g>
      ))}
      {refLine && (
        <g>
          <line x1={pad.l} x2={W - pad.r} y1={y(refLine.y)} y2={y(refLine.y)} stroke="var(--plum)" strokeDasharray="6 4" opacity={0.6} />
          <text x={W - pad.r} y={y(refLine.y) - 4} textAnchor="end">
            {refLine.label}
          </text>
        </g>
      )}
      {series.map((s) => {
        if (!s.values.length) return null;
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        return (
          <g key={s.label}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {s.values.length < 40 && s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />)}
          </g>
        );
      })}
      {labels && labels.length > 1 && (
        <>
          <text x={pad.l} y={H - 4}>
            {labels[0]}
          </text>
          <text x={W - pad.r} y={H - 4} textAnchor="end">
            {labels[labels.length - 1]}
          </text>
        </>
      )}
    </svg>
  );
}

export function Sparkline({ values, color = 'var(--honey)', width = 120, height = 32, lo = 0, hi = 100 }: { values: number[]; color?: string; width?: number; height?: number; lo?: number; hi?: number }) {
  if (values.length < 2) return <svg width={width} height={height} />;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - lo) / (hi - lo)) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
