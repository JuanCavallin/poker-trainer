import { cardPretty } from './cards';
import { NUM_COMBOS, comboC1, comboC2 } from './combos';
import { equityOnRunouts } from './equity';
import { drawStrength } from './handinfo';
import type { Scenario } from './preflop';
import { parseRange, removeDead } from './range';
import { Rng, hashUnit } from './rng';
import type { ProfileId } from './profiles';
import type { HistoryStreet } from './types';

/**
 * Simulates flop and turn play with simple, plausible heuristics so that each river spot
 * starts from believable ranges. Exactness isn't needed here: the river itself is solved,
 * and the player sees the villain's range explicitly.
 */

type Size = 'small' | 'half' | 'big';
const SIZE_FRAC: Record<Size, number> = { small: 0.33, half: 0.5, big: 0.75 };

interface Step {
  player: 0 | 1;
  kind: 'check' | 'bet' | 'call';
  size?: Size;
  /** For bets: share of the range that bets. For checks: complement of a bet with this target. For calls: continue share. */
  target: number;
}

interface Line {
  steps: Step[];
  newAggressor: 0 | 1 | -1;
}

export interface StreetSimResult {
  ranges: [Float32Array, Float32Array];
  pot: number;
  stack: number;
  history: HistoryStreet[];
  riverAggressor: 0 | 1;
}

function weightedPercentiles(values: Float64Array, weights: ArrayLike<number>): Float64Array {
  const n = values.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => values[a] - values[b]);
  let total = 0;
  for (let i = 0; i < n; i++) total += weights[i];
  const out = new Float64Array(n);
  let cum = 0;
  for (const i of idx) {
    out[i] = total > 0 ? (cum + weights[i] / 2) / total : 0.5;
    cum += weights[i];
  }
  return out;
}

function betPropensity(pct: number, draw: number, size: Size, h: number): number {
  if (size === 'small') {
    if (pct >= 0.55) return 0.55 + 0.45 * pct;
    if (draw >= 0.4) return 0.62 + 0.3 * draw;
    if (pct < 0.3) return 0.3 + 0.45 * h;
    return 0.42 + 0.2 * pct;
  }
  if (pct >= 0.7) return 0.6 + 0.4 * pct;
  if (draw >= 0.4) return 0.55 + 0.35 * draw;
  if (pct < 0.3) return 0.18 + 0.5 * h;
  return 0.22 + 0.15 * pct;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Finds per-hand probabilities p_i = sigmoid((prop_i - tau)/temp) whose weighted mean hits `target`. */
function fitProbabilities(prop: Float64Array, w: ArrayLike<number>, target: number, temp: number): Float64Array {
  let lo = -2;
  let hi = 3;
  const p = new Float64Array(prop.length);
  let total = 0;
  for (let i = 0; i < prop.length; i++) total += w[i];
  for (let it = 0; it < 40; it++) {
    const tau = (lo + hi) / 2;
    let s = 0;
    for (let i = 0; i < prop.length; i++) {
      p[i] = sigmoid((prop[i] - tau) / temp);
      s += w[i] * p[i];
    }
    if (s / total > target) lo = tau;
    else hi = tau;
  }
  return p;
}

interface StreetCtx {
  ids: [number[], number[]];
  pct: [Float64Array, Float64Array];
  draw: [Float64Array, Float64Array];
}

function liveIds(range: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < NUM_COMBOS; i++) if (range[i] > 1e-4) out.push(i);
  return out;
}

function sampleRunouts(rng: Rng, partial: number[], cardsNeeded: number, count: number): number[][] {
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!partial.includes(c)) deck.push(c);
  if (cardsNeeded === 1) {
    if (deck.length <= count) return deck.map((c) => [c]);
    return rng.shuffle(deck.slice()).slice(0, count).map((c) => [c]);
  }
  const out: number[][] = [];
  for (let k = 0; k < count; k++) {
    const a = deck[rng.int(deck.length)];
    let b = deck[rng.int(deck.length)];
    while (b === a) b = deck[rng.int(deck.length)];
    out.push([a, b]);
  }
  return out;
}

function streetContext(ranges: [Float32Array, Float32Array], partial: number[], rng: Rng): StreetCtx {
  const ids: [number[], number[]] = [liveIds(ranges[0]), liveIds(ranges[1])];
  const runouts = sampleRunouts(rng, partial, 5 - partial.length, partial.length === 3 ? 22 : 18);
  const pct: Float64Array[] = [];
  const draw: Float64Array[] = [];
  for (const p of [0, 1] as const) {
    const o = 1 - p;
    const eq = equityOnRunouts(ids[p], ids[o], ids[o].map((id) => ranges[o][id]), partial, runouts);
    pct.push(weightedPercentiles(eq, ids[p].map((id) => ranges[p][id])));
    draw.push(Float64Array.from(ids[p], (id) => drawStrength(partial, comboC1[id], comboC2[id])));
  }
  return { ids, pct: [pct[0], pct[1]], draw: [draw[0], draw[1]] };
}

function applyStep(step: Step, ranges: [Float32Array, Float32Array], ctx: StreetCtx, salt: number): void {
  const p = step.player;
  const ids = ctx.ids[p];
  const w = ids.map((id) => ranges[p][id]);
  const pct = ctx.pct[p];
  const draw = ctx.draw[p];
  if (step.kind === 'call') {
    const prop = Float64Array.from(ids, (_, k) => Math.min(1, pct[k] + 0.5 * draw[k] * (1 - pct[k])));
    const prob = fitProbabilities(prop, w, step.target, 0.06);
    ids.forEach((id, k) => {
      // The very top sometimes raised instead, which caps the caller's range a little.
      const raiseCut = pct[k] > 0.92 ? 1 - 0.45 * ((pct[k] - 0.92) / 0.08) : 1;
      ranges[p][id] *= prob[k] * raiseCut;
    });
    return;
  }
  const size = step.size ?? 'small';
  const prop = Float64Array.from(ids, (id, k) => betPropensity(pct[k], draw[k], size, hashUnit(id, salt)));
  const prob = fitProbabilities(prop, w, step.target, 0.07);
  ids.forEach((id, k) => {
    ranges[p][id] *= step.kind === 'bet' ? prob[k] : 1 - prob[k];
  });
}

function chooseLine(rng: Rng, aggressor: 0 | 1, street: 'Flop' | 'Turn', flopHadBet: boolean, villain: 0 | 1, profile: ProfileId): Line {
  const A = aggressor;
  const callAdj = (who: 0 | 1, base: number) => {
    if (who !== villain) return base;
    if (profile === 'station') return Math.min(0.9, base + 0.15);
    if (profile === 'nit') return Math.max(0.3, base - 0.1);
    if (profile === 'maniac') return Math.min(0.85, base + 0.08);
    return base;
  };
  const betAdj = (who: 0 | 1, base: number) => {
    if (who !== villain) return base;
    if (profile === 'maniac' || profile === 'fox') return Math.min(0.85, base + 0.12);
    if (profile === 'nit' || profile === 'station') return Math.max(0.15, base - 0.1);
    return base;
  };

  const lines: { w: number; line: Line }[] = [];
  const isFlop = street === 'Flop';
  const smallTarget = isFlop ? 0.62 : 0.52;
  const bigTarget = isFlop ? 0.38 : flopHadBet ? 0.45 : 0.42;

  if (A === 1) {
    // Aggressor in position: OOP checks to them first.
    lines.push({
      w: isFlop ? 0.4 : 0.16,
      line: { steps: [{ player: 0, kind: 'check', size: 'small', target: 0.06 }, { player: 1, kind: 'bet', size: 'small', target: betAdj(1, smallTarget) }, { player: 0, kind: 'call', target: callAdj(0, 0.62) }], newAggressor: 1 },
    });
    lines.push({
      w: isFlop ? 0.2 : 0.32,
      line: { steps: [{ player: 0, kind: 'check', size: 'small', target: 0.06 }, { player: 1, kind: 'bet', size: 'big', target: betAdj(1, bigTarget) }, { player: 0, kind: 'call', target: callAdj(0, 0.52) }], newAggressor: 1 },
    });
    lines.push({
      w: isFlop ? 0.32 : 0.38,
      line: { steps: [{ player: 0, kind: 'check', size: 'small', target: 0.06 }, { player: 1, kind: 'check', size: 'small', target: betAdj(1, 0.55) }], newAggressor: 1 },
    });
    lines.push({
      w: isFlop ? 0.08 : 0.14,
      line: { steps: [{ player: 0, kind: 'bet', size: isFlop ? 'small' : 'half', target: betAdj(0, isFlop ? 0.1 : 0.22) }, { player: 1, kind: 'call', target: callAdj(1, 0.66) }], newAggressor: 0 },
    });
  } else {
    // Aggressor out of position.
    lines.push({
      w: isFlop ? 0.38 : 0.16,
      line: { steps: [{ player: 0, kind: 'bet', size: 'small', target: betAdj(0, smallTarget - 0.08) }, { player: 1, kind: 'call', target: callAdj(1, 0.64) }], newAggressor: 0 },
    });
    lines.push({
      w: isFlop ? 0.2 : 0.3,
      line: { steps: [{ player: 0, kind: 'bet', size: 'big', target: betAdj(0, bigTarget - 0.05) }, { player: 1, kind: 'call', target: callAdj(1, 0.54) }], newAggressor: 0 },
    });
    lines.push({
      w: isFlop ? 0.3 : 0.36,
      line: { steps: [{ player: 0, kind: 'check', size: 'small', target: betAdj(0, 0.5) }, { player: 1, kind: 'check', size: 'half', target: betAdj(1, 0.42) }], newAggressor: 0 },
    });
    lines.push({
      w: isFlop ? 0.12 : 0.18,
      line: { steps: [{ player: 0, kind: 'check', size: 'small', target: betAdj(0, 0.5) }, { player: 1, kind: 'bet', size: 'half', target: betAdj(1, 0.45) }, { player: 0, kind: 'call', target: callAdj(0, 0.56) }], newAggressor: 1 },
    });
  }
  return rng.weighted(lines.map((l) => l.line), lines.map((l) => l.w));
}

function describeStep(step: Step, positions: [string, string], pot: number): { text: string; amount: number } {
  const who = positions[step.player];
  if (step.kind === 'check') return { text: `${who} checks`, amount: 0 };
  if (step.kind === 'bet') {
    const amount = Math.round(SIZE_FRAC[step.size ?? 'small'] * pot * 10) / 10;
    return { text: `${who} bets ${amount}bb (${Math.round(SIZE_FRAC[step.size ?? 'small'] * 100)}%)`, amount };
  }
  return { text: `${who} calls`, amount: 0 };
}

export function simulateStreets(sc: Scenario, board: number[], rng: Rng, villain: 0 | 1, profile: ProfileId): StreetSimResult | null {
  const positions: [string, string] = [sc.oopPos, sc.ipPos];
  const flop = board.slice(0, 3);
  const ranges: [Float32Array, Float32Array] = [removeDead(parseRange(sc.oopRange), flop), removeDead(parseRange(sc.ipRange), flop)];
  let pot = sc.pot;
  let stack = sc.stack;
  let aggressor = sc.aggressor;
  const history: HistoryStreet[] = [{ street: 'Preflop', cards: [], pot: 0, lines: [sc.preflop] }];
  let flopHadBet = false;

  for (const street of ['Flop', 'Turn'] as const) {
    const partial = street === 'Flop' ? flop : board.slice(0, 4);
    if (street === 'Turn') {
      for (const p of [0, 1]) ranges[p] = removeDead(ranges[p], [board[3]]);
    }
    const ctx = streetContext(ranges, partial, rng);
    const line = chooseLine(rng, aggressor, street, flopHadBet, villain, profile);
    const lines: string[] = [];
    const potBefore = pot;
    let pendingBet = 0;
    const salt = rng.int(1 << 30);
    for (const step of line.steps) {
      applyStep(step, ranges, ctx, salt);
      const d = describeStep(step, positions, pot);
      if (step.kind === 'bet') pendingBet = Math.min(d.amount, stack);
      if (step.kind === 'call') {
        pot = Math.round((pot + 2 * pendingBet) * 10) / 10;
        stack = Math.round((stack - pendingBet) * 10) / 10;
        if (street === 'Flop') flopHadBet = true;
      }
      lines.push(d.text);
    }
    if (line.newAggressor >= 0) aggressor = line.newAggressor as 0 | 1;
    history.push({ street, cards: street === 'Flop' ? flop : [board[3]], pot: potBefore, lines });
  }

  for (const p of [0, 1]) ranges[p] = removeDead(ranges[p], [board[4]]);
  history.push({ street: 'River', cards: [board[4]], pot, lines: [] });

  for (const p of [0, 1]) {
    let total = 0;
    for (let i = 0; i < NUM_COMBOS; i++) total += ranges[p][i];
    if (total < 12) return null;
  }
  return { ranges, pot, stack, history, riverAggressor: aggressor };
}

export const boardText = (cards: number[]) => cards.map(cardPretty).join(' ');
