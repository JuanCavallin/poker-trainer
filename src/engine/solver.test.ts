import { describe, expect, it } from 'vitest';
import { parseCards } from './cards';
import { comboC1, comboC2 } from './combos';
import { equityVsRange, liveCombos, makeHandList } from './equity';
import { evaluateWith } from './evaluator';
import { PostflopGame, sampleCards } from './postflop';
import { parseRange, removeDead } from './range';
import { Rng } from './rng';
import { Solver } from './solver';
import { DEFAULT_TREE, NODE_ACTION, type StreetConfig } from './tree';

const BTN = '22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, 54s, A2o+, K8o+, Q9o+, J9o+, T8o+, 98o';
const BB = '99-22, AJs-A6s, A2s, K2s-KJs, Q2s+, J4s+, T6s+, 96s+, 85s+, 74s+, 63s+, 53s+, 43s, AJo-A2o, K5o+, Q8o+, J8o+, T8o+, 97o+, 87o, 76o, 65o';

const river = (board: number[], oop: string, ip: string, tree: StreetConfig, pot: number, stack: number) =>
  new PostflopGame({ board, pot, stack, ranges: [parseRange(oop), parseRange(ip)], streets: { 3: tree }, lastStreet: 3, seed: 1 });

const value0 = (s: Solver): number => {
  const v = s.evaluate(0, 0, s.reach[1], 'avg', s.avgStrategy);
  let b = 0;
  for (let i = 0; i < v.length; i++) b += s.reach[0][i] * v[i];
  return b;
};

describe('solver', () => {
  it.each([
    [1.0, 1 / 3, 1 / 2],
    [0.5, 0.25, 2 / 3],
  ])('matches clairvoyance-game theory for a %s pot bet', (size, bluffShare, callFreq) => {
    const board = parseCards('AsKd7c4h2s');
    const game = river(board, 'AA, JT', 'KQ', { oopBets: [size], ipBets: [], raiseMult: 3, maxRaises: 0, allinFrac: 1.1, allowAllin: false }, 10, 100);
    const solver = new Solver(game);
    const res = solver.solve({ maxIter: 3000, targetPct: 0.05 });
    expect(res.exploitabilityPct).toBeLessThan(0.3);

    const nodes = game.nodes;
    const root = solver.avgStrategy(0);
    const betIdx = nodes[0].actions.findIndex((a) => a.kind === 'bet');
    const h0 = game.hands[0];
    let value = 0;
    let bluffs = 0;
    for (let i = 0; i < h0.n; i++) {
      const isAces = comboC1[h0.combos[i]] >> 2 === 12;
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
    const n1 = game.n[1];
    let call = 0;
    for (let i = 0; i < n1; i++) call += ipStrat[callIdx * n1 + i];
    expect(call / n1).toBeCloseTo(callFreq, 1);
  });

  it('converges quickly on a realistic river with the default tree', () => {
    const board = parseCards('Ks7d2c9s4s');
    const solver = new Solver(river(board, BB, BTN, DEFAULT_TREE, 20, 80));
    const t0 = performance.now();
    const res = solver.solve({ maxIter: 600, targetPct: 0.3 });
    const ms = performance.now() - t0;
    console.log(`river solve: ${res.iterations} iters, ${res.exploitabilityPct.toFixed(3)}% pot, ${ms.toFixed(0)}ms, nodes ${solver.nodes.length}`);
    expect(res.exploitabilityPct).toBeLessThan(0.6);
  });

  it('weights dealt cards so a check-through turn equals the average of its rivers', () => {
    const turn = parseCards('Kh8d3c2s');
    const oop = 'AA, KQ, 99, 87s, 54s, QJs';
    const ip = 'KK, AK, 88, T9s, A5s, J9s';
    const rTree: StreetConfig = { oopBets: [0.75], ipBets: [0.75], raiseMult: 3, maxRaises: 0, allinFrac: 2, allowAllin: false };
    const noBet: StreetConfig = { oopBets: [], ipBets: [], raiseMult: 3, maxRaises: 0, allinFrac: 2, allowAllin: false };
    const game = new PostflopGame({ board: turn, pot: 10, stack: 50, ranges: [parseRange(oop), parseRange(ip)], streets: { 2: noBet, 3: rTree }, lastStreet: 3, seed: 3 });
    const solver = new Solver(game);
    const res = solver.solve({ maxIter: 2000, targetPct: 0.05, checkEvery: 100 });
    expect(res.exploitabilityPct).toBeLessThan(0.2);
    const z = (s: Solver) => {
      const m = s.oppMass(0, s.reach[1]);
      let t = 0;
      for (let i = 0; i < m.length; i++) t += s.reach[0][i] * m[i];
      return t;
    };
    const vTurn = value0(solver) / z(solver);

    const used = new Set(turn);
    const N = 52 - 4;
    let sum = 0;
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const g = river([...turn, c], oop, ip, rTree, 10, 50);
      const s = new Solver(g);
      s.solve({ maxIter: 2000, targetPct: 0.05, checkEvery: 100 });
      sum += value0(s) / (N - 4);
    }
    expect(vTurn).toBeCloseTo(sum / z(solver), 2);
  });

  it('solves a flop with sampled turns and a depth-limited river quickly', () => {
    const flop = parseCards('Qs8h4d');
    const rich: StreetConfig = { oopBets: [0.33, 0.75], ipBets: [0.33, 0.75], raiseMult: 3, maxRaises: 1, allinFrac: 0.7, allowAllin: false };
    const lean: StreetConfig = { oopBets: [0.66], ipBets: [0.66], raiseMult: 3, maxRaises: 0, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 1.5 };
    const game = new PostflopGame({
      board: flop,
      pot: 5.5,
      stack: 97.5,
      ranges: [removeDead(parseRange(BB), flop), removeDead(parseRange(BTN), flop)],
      streets: { 1: rich, 2: lean },
      lastStreet: 2,
      dealTurn: 6,
      leafRivers: 6,
      edge: 0.03,
      seed: 11,
    });
    const solver = new Solver(game);
    const t0 = performance.now();
    const res = solver.solve({ maxIter: 300, targetPct: 0.5, checkEvery: 25 });
    const ms = performance.now() - t0;
    const actionNodes = game.nodes.filter((n) => n.type === NODE_ACTION).length;
    console.log(`flop solve: ${res.iterations} iters, ${res.exploitabilityPct.toFixed(2)}% pot, ${ms.toFixed(0)}ms, hands ${game.n[0]}x${game.n[1]}, nodes ${game.nodes.length} (${actionNodes} action)`);
    expect(res.exploitabilityPct).toBeLessThan(1.5);
  });

  it('solves a turn with every river card', () => {
    const turn = parseCards('Qs8h4d2c');
    const rich: StreetConfig = { oopBets: [0.33, 0.75], ipBets: [0.33, 0.75], raiseMult: 3, maxRaises: 1, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 2 };
    const lean: StreetConfig = { oopBets: [0.75], ipBets: [0.75], raiseMult: 3, maxRaises: 0, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 1.5 };
    const game = new PostflopGame({
      board: turn,
      pot: 12,
      stack: 90,
      ranges: [removeDead(parseRange('99-22, AJs-A6s, KTs, QJs, JTs, T9s, 98s, 87s, 76s, AQo, AJo, KQo, QJo, Q9s, Q8s'), turn), removeDead(parseRange('TT+, AQs+, AQo+, KQs, QJs, Q9s, 98s, 87s, 65s, A5s, A4s, KJs, JTs'), turn)],
      streets: { 2: rich, 3: lean },
      lastStreet: 3,
      dealRiver: 0,
      seed: 5,
    });
    const solver = new Solver(game);
    const t0 = performance.now();
    const res = solver.solve({ maxIter: 400, targetPct: 0.3, checkEvery: 25 });
    const ms = performance.now() - t0;
    console.log(`turn solve: ${res.iterations} iters, ${res.exploitabilityPct.toFixed(2)}% pot, ${ms.toFixed(0)}ms, hands ${game.n[0]}x${game.n[1]}, nodes ${game.nodes.length}`);
    expect(res.exploitabilityPct).toBeLessThan(0.8);
  });

  it('spreads sampled cards across suits and ranks', () => {
    const rng = new Rng(9);
    const deck = Array.from({ length: 49 }, (_, i) => i + 3);
    const pick = sampleCards(deck, 8, rng);
    expect(new Set(pick).size).toBe(8);
    const suits = [0, 0, 0, 0];
    for (const c of pick) suits[c & 3]++;
    expect(Math.max(...suits)).toBeLessThanOrEqual(2);
    const ranks = pick.map((c) => c >> 2);
    expect(Math.max(...ranks) - Math.min(...ranks)).toBeGreaterThanOrEqual(9);
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

  it('computes turn equity over every river exactly', () => {
    const turn = parseCards('Ah7c4d2s');
    const game = new PostflopGame({ board: turn, pot: 10, stack: 50, ranges: [parseRange('KK, 76s, 53s'), parseRange('AK, 44, T9s')], streets: { 2: DEFAULT_TREE, 3: DEFAULT_TREE }, lastStreet: 3, dealRiver: 2, seed: 1 });
    const eq = game.equity(0, game.reach[1], turn, 0, 0);
    const h0 = game.hands[0];
    const h1 = game.hands[1];
    for (let i = 0; i < h0.n; i += 3) {
      const a = h0.c1[i];
      const b = h0.c2[i];
      let win = 0;
      let tot = 0;
      for (let j = 0; j < h1.n; j++) {
        const c = h1.c1[j];
        const d = h1.c2[j];
        if (c === a || c === b || d === a || d === b) continue;
        for (let r = 0; r < 52; r++) {
          if ([...turn, a, b, c, d].includes(r)) continue;
          const sa = evaluateWith([...turn, r], a, b);
          const sb = evaluateWith([...turn, r], c, d);
          tot += 1;
          win += sa > sb ? 1 : sa === sb ? 0.5 : 0;
        }
      }
      expect(eq[i]).toBeCloseTo(win / tot, 9);
    }
  });
});
