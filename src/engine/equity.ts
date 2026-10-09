import { NUM_COMBOS, comboC1, comboC2 } from './combos';
import { evaluateWith } from './evaluator';

/** A list of combos with precomputed showdown strengths on a fixed 5-card board. */
export interface HandList {
  n: number;
  combos: Int16Array;
  c1: Uint8Array;
  c2: Uint8Array;
  strength: Int32Array;
  /** Indices sorted by ascending strength. */
  order: Int32Array;
  /** combo id -> index in this list, or -1. */
  indexOf: Int16Array;
}

export function makeHandList(comboIds: ArrayLike<number>, board: readonly number[]): HandList {
  const n = comboIds.length;
  const combos = new Int16Array(n);
  const c1 = new Uint8Array(n);
  const c2 = new Uint8Array(n);
  const strength = new Int32Array(n);
  const indexOf = new Int16Array(NUM_COMBOS).fill(-1);
  for (let i = 0; i < n; i++) {
    const id = comboIds[i];
    combos[i] = id;
    c1[i] = comboC1[id];
    c2[i] = comboC2[id];
    strength[i] = evaluateWith(board, c1[i], c2[i]);
    indexOf[id] = i;
  }
  const order = Int32Array.from({ length: n }, (_, i) => i).sort((a, b) => strength[a] - strength[b]);
  return { n, combos, c1, c2, strength, order, indexOf };
}

/** Combo ids with positive weight that don't touch the board. */
export function liveCombos(weights: ArrayLike<number>, dead: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < NUM_COMBOS; i++) {
    if (weights[i] <= 0) continue;
    const a = comboC1[i];
    const b = comboC2[i];
    if (dead.includes(a) || dead.includes(b)) continue;
    out.push(i);
  }
  return out;
}

const cardB = new Float64Array(52);
const cardLE = new Float64Array(52);
const cardT = new Float64Array(52);

/**
 * Showdown equity of each hero hand against a weighted villain list, with card removal.
 * Returns NaN for hands with no compatible villain combos.
 */
export function equityVsRange(hero: HandList, vill: HandList, w: ArrayLike<number>, out: Float64Array = new Float64Array(hero.n)): Float64Array {
  cardB.fill(0);
  cardLE.fill(0);
  cardT.fill(0);
  let tot = 0;
  for (let j = 0; j < vill.n; j++) {
    const x = w[j];
    if (x === 0) continue;
    tot += x;
    cardT[vill.c1[j]] += x;
    cardT[vill.c2[j]] += x;
  }
  let totB = 0;
  let totLE = 0;
  let jB = 0;
  let jLE = 0;
  const vo = vill.order;
  const vs = vill.strength;
  for (let k = 0; k < hero.n; k++) {
    const i = hero.order[k];
    const s = hero.strength[i];
    while (jB < vill.n && vs[vo[jB]] < s) {
      const j = vo[jB++];
      const x = w[j];
      totB += x;
      cardB[vill.c1[j]] += x;
      cardB[vill.c2[j]] += x;
    }
    while (jLE < vill.n && vs[vo[jLE]] <= s) {
      const j = vo[jLE++];
      const x = w[j];
      totLE += x;
      cardLE[vill.c1[j]] += x;
      cardLE[vill.c2[j]] += x;
    }
    const a = hero.c1[i];
    const b = hero.c2[i];
    const same = vill.indexOf[hero.combos[i]];
    const sw = same >= 0 ? w[same] : 0;
    const below = totB - cardB[a] - cardB[b];
    const le = totLE - cardLE[a] - cardLE[b] + sw;
    const total = tot - cardT[a] - cardT[b] + sw;
    out[i] = total > 1e-9 ? Math.min(1, Math.max(0, (below + 0.5 * (le - below)) / total)) : NaN;
  }
  return out;
}

/** Weighted average equity of a whole range (NaN-safe). */
export function rangeEquity(eq: ArrayLike<number>, w: ArrayLike<number>): number {
  let s = 0;
  let t = 0;
  for (let i = 0; i < eq.length; i++) {
    if (!Number.isFinite(eq[i]) || w[i] <= 0) continue;
    s += eq[i] * w[i];
    t += w[i];
  }
  return t > 0 ? s / t : NaN;
}

/**
 * Equity of hero combos vs villain combos on an incomplete board, averaged over runouts.
 * Used for street-by-street range narrowing before the river.
 */
export function equityOnRunouts(
  heroIds: readonly number[],
  villIds: readonly number[],
  villW: ArrayLike<number>,
  partial: readonly number[],
  runouts: readonly number[][],
): Float64Array {
  const sum = new Float64Array(heroIds.length);
  const cnt = new Float64Array(heroIds.length);
  for (const ro of runouts) {
    const board = [...partial, ...ro];
    const hIdx: number[] = [];
    const hIds: number[] = [];
    heroIds.forEach((id, k) => {
      if (!ro.includes(comboC1[id]) && !ro.includes(comboC2[id])) {
        hIdx.push(k);
        hIds.push(id);
      }
    });
    const vIds: number[] = [];
    const vW: number[] = [];
    villIds.forEach((id, k) => {
      if (!ro.includes(comboC1[id]) && !ro.includes(comboC2[id])) {
        vIds.push(id);
        vW.push(villW[k]);
      }
    });
    if (!hIds.length || !vIds.length) continue;
    const hl = makeHandList(hIds, board);
    const vl = makeHandList(vIds, board);
    const eq = equityVsRange(hl, vl, vW);
    for (let i = 0; i < hl.n; i++) {
      if (Number.isFinite(eq[i])) {
        sum[hIdx[i]] += eq[i];
        cnt[hIdx[i]] += 1;
      }
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = cnt[i] > 0 ? sum[i] / cnt[i] : 0.5;
  return sum;
}
