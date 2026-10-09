import { describe, expect, it } from 'vitest';
import { Rng } from './rng';
import { liveMetrics, newStrategy, resolveStrategy, scoreRange, spotStats } from './analysis';
import { exploitabilityGapPct, generateSpotWithContext } from './spot';
import { NODE_TYPES } from './types';

describe('scoring', () => {
  it('ranks strategies sensibly', () => {
    const rows: string[] = [];
    const rng = new Rng(5);
    for (const nodeType of NODE_TYPES) {
      for (let s = 0; s < 3; s++) {
        const { spot, ctx } = generateSpotWithContext({ seed: 500 + s * 17 + nodeType.length, nodeType });
        const nA = spot.actions.length;
        const st = spotStats(spot);
        const make = (fn: (k: number, rank: number) => number[]) => {
          const out = newStrategy(spot);
          st.heroOrder.forEach((k, rank) => fn(k, rank / spot.hero.n).forEach((p, a) => (out[k * nA + a] = p)));
          return out;
        };
        const passive = spot.actions.findIndex((a) => a.key === 'check' || a.key === 'fold');
        const callIdx = spot.actions.findIndex((a) => a.key === 'call');
        const big = spot.actions.findIndex((a) => a.aggressive && (a.key === 'big' || a.key === 'raise'));
        const aggr = big >= 0 ? big : spot.actions.findIndex((a) => a.aggressive);
        const onehot = (a: number) => spot.actions.map((_, i) => (i === a ? 1 : 0));
        const strategies: Record<string, Float32Array> = {
          gto: Float32Array.from(spot.solution.gtoStrategy),
          // Bet/raise the top 25%, bluff the bottom 10%, check/call/fold the middle.
          naive: make((_, r) => (r < 0.25 || r > 0.9 ? onehot(aggr) : callIdx >= 0 && r < 0.6 ? onehot(callIdx) : onehot(passive))),
          passive: make(() => onehot(callIdx >= 0 ? callIdx : passive)),
          maniac: make(() => onehot(aggr)),
          random: make(() => {
            const v = spot.actions.map(() => rng.next());
            const t = v.reduce((a, b) => a + b, 0);
            return v.map((x) => x / t);
          }),
        };
        const out: string[] = [];
        for (const [name, strat] of Object.entries(strategies)) {
          const resolved = resolveStrategy(spot, strat);
          const expl = exploitabilityGapPct(ctx, resolved);
          const sc = scoreRange(spot, resolved, expl);
          out.push(`${name} ${sc.score} (ev ${sc.evLossPct.toFixed(1)}%, ex ${expl.toFixed(1)}%, match ${sc.matchPct.toFixed(0)}%)`);
          if (name === 'gto') expect(sc.score).toBeGreaterThan(93);
          if (name === 'maniac') expect(sc.score).toBeLessThan(80);
        }
        const lm = liveMetrics(spot, newStrategy(spot));
        expect(lm.unassigned).toBeCloseTo(lm.total, 4);
        rows.push(`${nodeType.padEnd(11)} ${out.join(' | ')}`);
      }
    }
    console.log(rows.join('\n'));
  });
});
