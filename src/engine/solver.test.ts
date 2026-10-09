import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { comboC1, comboC2 } from './combos';
import { equityVsRange, liveCombos, makeHandList } from './equity';
import { evaluateWith } from './evaluator';
import { scenarioById } from './preflop';
import { parseRange, removeDead } from './range';
import { Rng } from './rng';
import { RiverSolver } from './solver';
import { DEFAULT_TREE, buildTree } from './tree';

function setup(board: number[], oop: string, ip: string, tree: Parameters<typeof buildTree>[0]) {
  const r0 = removeDead(parseRange(oop), board);
  const r1 = removeDead(parseRange(ip), board);
  const ids0 = liveCombos(r0, board);
  const ids1 = liveCombos(r1, board);
  const h0 = makeHandList(ids0, board);
  const h1 = makeHandList(ids1, board);
  const reach: [Float64Array, Float64Array] = [Float64Array.from(ids0, (id) => r0[id]), Float64Array.from(ids1, (id) => r1[id])];
  const nodes = buildTree(tree);
  return { solver: new RiverSolver(nodes, tree.pot, [h0, h1], reach), nodes, h0, h1, reach };
}

describe('river solver', () => {
  it.each([
    [1.0, 1 / 3, 1 / 2],
    [0.5, 0.25, 2 / 3],
  ])('matches clairvoyance-game theory for a %s pot bet', (size, bluffShare, callFreq) => {
    const board = parseCards('AsKd7c4h2s');
    const { solver, nodes, h0 } = setup(board, 'AA, JT', 'KQ', {
      pot: 10,
      stack: 100,
      oopBets: [size],
      ipBets: [],
      raiseMult: 3,
      maxRaises: 0,
      allinFrac: 1.1,
      allowAllin: false,
    });
    const res = solver.solve(3000, 0.05);
    expect(res.exploitabilityPct).toBeLessThan(0.3);

    const root = solver.avgStrategy(0);
    const betIdx = nodes[0].actions.findIndex((a) => a.kind === 'bet');
    let value = 0;
    let bluffs = 0;
    for (let i = 0; i < h0.n; i++) {
      const isAces = (comboC1[h0.combos[i]] >> 2) === 12;
      const bet = root[betIdx * h0.n + i];
      if (isAces) {
        expect(bet).toBeGreaterThan(0.95);
        value += bet;
      } else bluffs += bet;
    }
    expect(bluffs / (value + bluffs)).toBeCloseTo(bluffShare, 1);

    const facing = nodes[0].children[betIdx];
    const ipStrat = solver.avgStrategy(facing);
    const callIdx = nodes[facing].actions.findIndex((a) => a.kind === 'call');
    const n1 = solver.hands[1].n;
    let call = 0;
    for (let i = 0; i < n1; i++) call += ipStrat[callIdx * n1 + i];
    expect(call / n1).toBeCloseTo(callFreq, 1);
  });

  it('converges quickly on a realistic river with the default tree', () => {
    const board = parseCards('Ks7d2c9s4s');
    const sc = scenarioById('btn-bb');
    const { solver } = setup(board, sc.oopRange, sc.ipRange, { ...DEFAULT_TREE, pot: 20, stack: 80 });
    const t0 = performance.now();
    const res = solver.solve(600, 0.3);
    const ms = performance.now() - t0;
    console.log(`realistic solve: ${res.iterations} iters, ${res.exploitabilityPct.toFixed(3)}% pot, ${ms.toFixed(0)}ms, hands ${solver.hands[0].n}x${solver.hands[1].n}, nodes ${solver.nodes.length}`);
    expect(res.exploitabilityPct).toBeLessThan(0.6);
  });
});

describe('equity', () => {
  it('matches brute force with card removal and ties', () => {
    const rng = new Rng(7);
    const board = parseCards('Qh9h5c5d2s');
    const r0 = removeDead(parseRange('22+, A2s+, KTo+, QJs, 87s'), board);
    const r1 = removeDead(parseRange('55, QQ, AQ, KQ, Q9s, 98s, T9s, AhKh, A5s'), board);
    const ids0 = liveCombos(r0, board);
    const ids1 = liveCombos(r1, board);
    const w1 = ids1.map(() => 0.2 + rng.next());
    const h0 = makeHandList(ids0, board);
    const h1 = makeHandList(ids1, board);
    const eq = equityVsRange(h0, h1, w1);
    for (let i = 0; i < h0.n; i += 7) {
      const a = comboC1[h0.combos[i]];
      const b = comboC2[h0.combos[i]];
      const sa = evaluateWith(board, a, b);
      let win = 0;
      let tot = 0;
      for (let j = 0; j < h1.n; j++) {
        const c = comboC1[h1.combos[j]];
        const d = comboC2[h1.combos[j]];
        if (c === a || c === b || d === a || d === b) continue;
        const sb = evaluateWith(board, c, d);
        tot += w1[j];
        win += w1[j] * (sa > sb ? 1 : sa === sb ? 0.5 : 0);
      }
      expect(eq[i]).toBeCloseTo(win / tot, 9);
    }
  });
});
