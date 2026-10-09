import { describe, expect, it } from 'vitest';
import { cardStr } from './cards';
import { PROFILE_IDS } from './profiles';
import { exploitabilityGapPct, generateSpot, generateSpotWithContext } from './spot';
import { NODE_TYPES } from './types';

describe('spot generation', () => {
  it('produces consistent spots for every node type', () => {
    const times: number[] = [];
    for (const nodeType of NODE_TYPES) {
      for (let s = 1; s <= 4; s++) {
        const t0 = performance.now();
        const { spot, ctx } = generateSpotWithContext({ seed: s * 1013 + nodeType.length, nodeType });
        times.push(performance.now() - t0);
        const nA = spot.actions.length;
        expect(spot.nodeType).toBe(nodeType);
        expect(spot.hero.n).toBeGreaterThan(5);
        expect(spot.solution.solverExplPct).toBeLessThan(1);
        const foldIdx = spot.actions.findIndex((a) => a.key === 'fold');
        let worstGap = 0;
        for (let k = 0; k < spot.hero.n; k++) {
          let sum = 0;
          let mixEv = 0;
          let best = -Infinity;
          for (let a = 0; a < nA; a++) {
            const p = spot.solution.strategy[k * nA + a];
            const ev = spot.solution.ev[k * nA + a];
            sum += p;
            mixEv += p * ev;
            best = Math.max(best, ev);
          }
          expect(sum).toBeCloseTo(1, 4);
          if (foldIdx >= 0) expect(spot.solution.ev[k * nA + foldIdx]).toBeCloseTo(0, 6);
          worstGap = Math.max(worstGap, ((best - mixEv) / spot.pot) * spot.hero.weights[k]);
        }
        // Equilibrium play should be (nearly) indifferent/optimal for every combo that matters.
        expect(worstGap).toBeLessThan(0.06);
        // The equilibrium strategy itself is not exploitable beyond solver noise.
        expect(exploitabilityGapPct(ctx, spot.solution.gtoStrategy)).toBeLessThan(0.5);
      }
    }
    times.sort((a, b) => a - b);
    console.log(`spot generation ms: median ${times[Math.floor(times.length / 2)].toFixed(0)}, max ${times[times.length - 1].toFixed(0)}`);
  });

  it('punishes an unbalanced range with exploitability', () => {
    const { spot, ctx } = generateSpotWithContext({ seed: 99, nodeType: 'ip-vs-check' });
    const nA = spot.actions.length;
    const bigIdx = spot.actions.findIndex((a) => a.aggressive);
    const allBet = new Float32Array(spot.hero.n * nA);
    for (let k = 0; k < spot.hero.n; k++) allBet[k * nA + bigIdx] = 1;
    const checkIdx = spot.actions.findIndex((a) => a.key === 'check');
    const allCheck = new Float32Array(spot.hero.n * nA);
    for (let k = 0; k < spot.hero.n; k++) allCheck[k * nA + checkIdx] = 1;
    const a = exploitabilityGapPct(ctx, allBet);
    const b = exploitabilityGapPct(ctx, allCheck);
    console.log(`bet-everything gap ${a.toFixed(2)}% pot, check-everything gap ${b.toFixed(2)}% pot`);
    expect(a).toBeGreaterThan(2);
    expect(b).toBeGreaterThan(0.5);
  });

  it('builds exploit spots for each villain profile', () => {
    for (const profile of PROFILE_IDS) {
      const spot = generateSpot({ seed: 4242, profile, nodeType: profile === 'station' || profile === 'nit' ? 'ip-vs-check' : 'ip-vs-bet' });
      expect(spot.profile).toBe(profile);
      expect(spot.solution.mode).toBe(profile === 'gto' ? 'gto' : 'exploit');
      if (profile !== 'gto') expect(spot.hud?.stats.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic and supports suit-isomorphic replays', () => {
    const a = generateSpot({ seed: 777, nodeType: 'ip-vs-bet' });
    const b = generateSpot({ seed: 777, nodeType: 'ip-vs-bet' });
    expect(a.board).toEqual(b.board);
    expect(Array.from(a.solution.strategy)).toEqual(Array.from(b.solution.strategy));
    const c = generateSpot({ seed: 777, nodeType: 'ip-vs-bet', suitPerm: [3, 2, 1, 0] });
    expect(c.board.map((x) => cardStr(x)[0])).toEqual(a.board.map((x) => cardStr(x)[0]));
    expect(c.board.map((x) => cardStr(x)[1])).not.toEqual(a.board.map((x) => cardStr(x)[1]));
    expect(Array.from(c.solution.strategy)).toEqual(Array.from(a.solution.strategy));
  });

  it('respects texture filters', () => {
    for (const texture of ['dry', 'paired', 'flush-river', 'straight-river'] as const) {
      const spot = generateSpot({ seed: 31, texture });
      expect(spot.texture.id).toBe(texture);
    }
  });
});
