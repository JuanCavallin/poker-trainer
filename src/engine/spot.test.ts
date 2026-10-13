import { describe, expect, it } from 'vitest';
import { cardStr } from './cards';
import { NUM_COMBOS } from './combos';
import { PROFILE_IDS } from './profiles';
import { exploitabilityGapPct, generateSpot, generateSpotWithContext } from './spot';
import { NODE_TYPES, PREFLOP_NODE_TYPES, type SpotPackage, type Street } from './types';

function checkSolution(spot: SpotPackage, maxGap = 0.06) {
  const nA = spot.actions.length;
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
  expect(worstGap).toBeLessThan(maxGap);
}

describe('spot generation', () => {
  it('produces consistent river spots for every node type', () => {
    const times: number[] = [];
    for (const nodeType of NODE_TYPES) {
      for (let s = 1; s <= 3; s++) {
        const t0 = performance.now();
        const { spot, ctx } = generateSpotWithContext({ seed: s * 1013 + nodeType.length, nodeType });
        times.push(performance.now() - t0);
        expect(spot.street).toBe('river');
        expect(spot.nodeType).toBe(nodeType);
        expect(spot.board).toHaveLength(5);
        expect(spot.hero.n).toBeGreaterThan(5);
        expect(spot.solution.solverExplPct).toBeLessThan(1);
        checkSolution(spot);
        // The equilibrium strategy itself is not exploitable beyond solver noise.
        expect(exploitabilityGapPct(ctx, spot.solution.gtoStrategy)).toBeLessThan(0.5);
      }
    }
    times.sort((a, b) => a - b);
    console.log(`river spot ms: median ${times[Math.floor(times.length / 2)].toFixed(0)}, max ${times[times.length - 1].toFixed(0)}`);
  });

  it.each<[Street, number]>([
    ['flop', 3],
    ['turn', 4],
  ])('solves %s spots for every node type', (street, cards) => {
    for (const nodeType of NODE_TYPES) {
      const t0 = performance.now();
      const { spot, ctx } = generateSpotWithContext({ seed: 77 + nodeType.length, street, nodeType });
      const ms = performance.now() - t0;
      expect(spot.street).toBe(street);
      expect(spot.board).toHaveLength(cards);
      expect(spot.nodeType).toBe(nodeType);
      expect(spot.solution.solverExplPct).toBeLessThan(1.2);
      checkSolution(spot, 0.1);
      expect(exploitabilityGapPct(ctx, spot.solution.gtoStrategy)).toBeLessThan(1);
      console.log(`${street} ${nodeType}: ${ms.toFixed(0)}ms, ${spot.hero.n}x${spot.villain.n}, ${spot.solution.model.split('(')[0]}`);
    }
  });

  it('builds preflop spots for every decision with solved ranges', () => {
    for (const nodeType of PREFLOP_NODE_TYPES) {
      for (let s = 0; s < 4; s++) {
        const { spot, ctx } = generateSpotWithContext({ seed: 300 + s, street: 'preflop', nodeType });
        expect(spot.street).toBe('preflop');
        expect(spot.board).toHaveLength(0);
        expect(spot.nodeType).toBe(nodeType);
        checkSolution(spot, 0.08);
        if (nodeType !== 'rfi') expect(exploitabilityGapPct(ctx, spot.solution.gtoStrategy)).toBeLessThan(0.05);
        // Every combo of a hand class is played the same way preflop.
        expect(spot.family.startsWith('pre:')).toBe(true);
      }
    }
  });

  it('honours seat choices and lets either player act first', () => {
    const a = generateSpot({ seed: 5, street: 'flop', heroPos: 'BTN', villainPos: 'BB' });
    expect(a.heroPos).toBe('BTN');
    expect(a.heroIp).toBe(true);
    expect(['ip-vs-check', 'ip-vs-bet']).toContain(a.nodeType);
    const b = generateSpot({ seed: 6, street: 'turn', heroPos: 'BB', villainPos: 'CO', nodeType: 'oop-first' });
    expect(b.heroIp).toBe(false);
    expect(b.nodeType).toBe('oop-first');
    expect(b.villainAction.kind).toBe('none');
    const c = generateSpot({ seed: 7, street: 'preflop', heroPos: 'CO', villainPos: 'BB' });
    expect(['rfi', 'vs-3bet']).toContain(c.nodeType);
    const d = generateSpot({ seed: 8, street: 'preflop', heroPos: 'BB', nodeType: 'vs-open' });
    expect(d.heroPos).toBe('BB');
    expect(d.line[0].actor).toBe('villain');
  });

  it('records every earlier action with the range that took it', () => {
    const spot = generateSpot({ seed: 21, street: 'river', nodeType: 'ip-vs-bet' });
    expect(spot.line.length).toBeGreaterThanOrEqual(4);
    expect(spot.line[0].street).toBe('preflop');
    for (const step of spot.line) {
      expect(step.range).toHaveLength(NUM_COMBOS);
      let w = 0;
      for (const x of step.range) w += x;
      expect(w).toBeGreaterThan(1);
    }
    // The last step is the villain's river bet.
    expect(spot.line[spot.line.length - 1].actor).toBe('villain');
    expect(spot.line[spot.line.length - 1].street).toBe('river');
  });

  it('punishes an unbalanced range with exploitability', () => {
    // Find a spot where the equilibrium mixes checks and bets, so neither extreme is close to right.
    let found: ReturnType<typeof generateSpotWithContext> | null = null;
    for (let seed = 99; !found; seed++) {
      const res = generateSpotWithContext({ seed, nodeType: 'ip-vs-check' });
      const nA = res.spot.actions.length;
      const ci = res.spot.actions.findIndex((a) => a.key === 'check');
      let c = 0;
      let w = 0;
      for (let k = 0; k < res.spot.hero.n; k++) {
        c += res.spot.hero.weights[k] * res.spot.solution.gtoStrategy[k * nA + ci];
        w += res.spot.hero.weights[k];
      }
      if (c / w > 0.25 && c / w < 0.75) found = res;
    }
    const { spot, ctx } = found;
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
      const pre = generateSpot({ seed: 4243, profile, street: 'preflop', nodeType: 'vs-open' });
      expect(pre.solution.mode).toBe(profile === 'gto' ? 'gto' : 'exploit');
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

  it('replays the same earlier line for a twin with a new last card', () => {
    const a = generateSpot({ seed: 31, street: 'river', nodeType: 'oop-first' });
    const used = new Set(a.board);
    let river = 0;
    while (used.has(river)) river++;
    const b = generateSpot({ seed: 32, street: 'river', nodeType: 'oop-first', heroPos: a.heroPos as never, villainPos: a.villainPos as never, potType: a.scenario.potType as 'SRP', board: [...a.board.slice(0, 4), river], lineSeed: a.lineSeed });
    expect(b.history.slice(0, 3)).toEqual(a.history.slice(0, 3));
  });

  it('respects texture filters on every street', () => {
    for (const [street, texture] of [
      ['river', 'paired'],
      ['river', 'flush-river'],
      ['flop', 'f-monotone'],
      ['turn', 't-paired'],
    ] as const) {
      const spot = generateSpot({ seed: 31, street, texture });
      expect(spot.texture.id).toBe(texture);
    }
  });
});
