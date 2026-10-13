import { NUM_CLASSES, NUM_COMBOS, classCombos, classKind, classRanks, comboC1, comboC2, comboClass } from './combos';
import { PREFLOP_EQUITY_B64 } from './data/preflopEquity';
import { PREFLOP_SOLUTION } from './data/preflopSolution';
import type { ProfileId } from './profiles';
import { Solver, type Game, type StrategyFn } from './solver';
import { NODE_ACTION, type TreeAction, type TreeNode } from './tree';
import { POST_ORDER, PRE_ORDER, type Position } from './seats';

/**
 * Heads-up preflop games for 6-max, 100bb. Each pair of seats (opener vs a later responder) is a
 * small game over the 169 hand classes: open → fold / call / 3-bet → fold / call / 4-bet →
 * fold / call / jam → fold / call. Card removal between classes is exact (compatible combo counts).
 * When a call ends the preflop betting, the postflop is valued by equity realisation: each hand's
 * all-in equity scaled by how well it plays postflop (position, suitedness, connectedness, SPR).
 */

export { POSITIONS, OPENERS, POSITION_NAMES, isEarlier, respondersAfter, openersBefore, isOopVs, type Position } from './seats';
const POSTED: Record<Position, number> = { UTG: 0, HJ: 0, CO: 0, BTN: 0, SB: 0.5, BB: 1 };
export const STACK = 100;
const BLINDS = 1.5;

export type PotType = 'SRP' | '3BP';

export interface Matchup {
  opener: Position;
  responder: Position;
  /** Postflop out-of-position seat. */
  oop: Position;
  ip: Position;
  /** Preflop player index (0 = opener, 1 = responder) that is in position postflop. */
  ipPlayer: 0 | 1;
  posted: [number, number];
  /** Blinds of seats not in the hand (live blinds behind the responder count half: they may still play). */
  dead: number;
  /** Seats still to act behind the responder (squeeze risk for a cold call). */
  behind: number;
  open: number;
  threeBet: number;
  fourBet: number;
}

export function matchup(a: Position, b: Position): Matchup {
  if (a === b) throw new Error('Two different seats are needed');
  const [opener, responder] = PRE_ORDER[a] < PRE_ORDER[b] ? [a, b] : [b, a];
  const ipPlayer: 0 | 1 = POST_ORDER[opener] > POST_ORDER[responder] ? 0 : 1;
  const posted: [number, number] = [POSTED[opener], POSTED[responder]];
  let dead = 0;
  for (const p of ['SB', 'BB'] as Position[]) {
    if (p === opener || p === responder) continue;
    dead += PRE_ORDER[p] > PRE_ORDER[responder] ? POSTED[p] / 2 : POSTED[p];
  }
  const open = opener === 'SB' ? 3 : 2.5;
  const threeBet = ipPlayer === 1 ? 3 * open : 11;
  const fourBet = ipPlayer === 0 ? Math.round(2.2 * threeBet) : Math.round(2.6 * threeBet);
  return {
    opener,
    responder,
    oop: ipPlayer === 0 ? responder : opener,
    ip: ipPlayer === 0 ? opener : responder,
    ipPlayer,
    posted,
    dead,
    behind: 5 - PRE_ORDER[responder],
    open,
    threeBet,
    fourBet,
  };
}


// ------------------------------------------------------------------ class tables

let EQ: Float64Array | null = null;
let COMPAT: Float64Array | null = null;
let VS_RANDOM: Float64Array | null = null;

/** All-in equity of class a vs class b, averaged over compatible combos. */
export function classEquity(): Float64Array {
  if (EQ) return EQ;
  const bin = atob(PREFLOP_EQUITY_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const u16 = new Uint16Array(bytes.buffer);
  EQ = Float64Array.from(u16, (x) => x / 65535);
  return EQ;
}

/** Number of compatible (non-overlapping) combo pairs between two classes. */
export function classCompat(): Float64Array {
  if (COMPAT) return COMPAT;
  COMPAT = new Float64Array(NUM_CLASSES * NUM_CLASSES);
  for (let x = 0; x < NUM_COMBOS; x++) {
    const a = comboC1[x];
    const b = comboC2[x];
    const cx = comboClass[x] * NUM_CLASSES;
    for (let y = 0; y < NUM_COMBOS; y++) {
      const c = comboC1[y];
      const d = comboC2[y];
      if (a === c || a === d || b === c || b === d) continue;
      COMPAT[cx + comboClass[y]] += 1;
    }
  }
  return COMPAT;
}

/** Equity of each class against a random hand: the preflop strength ranking. */
export function vsRandom(): Float64Array {
  if (VS_RANDOM) return VS_RANDOM;
  const E = classEquity();
  const C = classCompat();
  VS_RANDOM = new Float64Array(NUM_CLASSES);
  for (let a = 0; a < NUM_CLASSES; a++) {
    let s = 0;
    let m = 0;
    for (let b = 0; b < NUM_CLASSES; b++) {
      s += C[a * NUM_CLASSES + b] * E[a * NUM_CLASSES + b];
      m += C[a * NUM_CLASSES + b];
    }
    VS_RANDOM[a] = s / m;
  }
  return VS_RANDOM;
}

export const classSize = (cls: number): number => classCombos[cls].length;

/** Equity of each class vs a weighted range of classes (card removal included). */
export function equityVsClasses(range: ArrayLike<number>): Float64Array {
  const E = classEquity();
  const C = classCompat();
  const out = new Float64Array(NUM_CLASSES);
  for (let a = 0; a < NUM_CLASSES; a++) {
    let s = 0;
    let m = 0;
    for (let b = 0; b < NUM_CLASSES; b++) {
      const w = range[b] * C[a * NUM_CLASSES + b];
      s += w * E[a * NUM_CLASSES + b];
      m += w;
    }
    out[a] = m > 0 ? s / m : NaN;
  }
  return out;
}

/** Expands class weights (169) to combo weights (1326). */
export function classesToCombos(w: ArrayLike<number>): Float32Array {
  const out = new Float32Array(NUM_COMBOS);
  for (let i = 0; i < NUM_COMBOS; i++) out[i] = w[comboClass[i]];
  return out;
}

// ------------------------------------------------------------------ realisation model

export const TERM_SRP = 0;
export const TERM_3BP = 1;
export const TERM_4BP = 2;
export const TERM_ALLIN = 3;

/**
 * How much of its raw equity a class realises postflop (1 = all of it). Position matters most; strong,
 * suited and connected hands realise more, weak offsuit hands much less (they rarely make hands that
 * can continue). Lower stack-to-pot ratios (3-bet and 4-bet pots) pull everything toward 1.
 */
export function realisation(cls: number, ip: boolean, term: number): number {
  if (term === TERM_ALLIN) return 1;
  const base = term === TERM_SRP ? (ip ? 1.0 : 0.75) : term === TERM_3BP ? (ip ? 1.0 : 0.88) : ip ? 1.0 : 0.96;
  const scale = term === TERM_SRP ? 1 : term === TERM_3BP ? 0.6 : 0.3;
  const [hi, lo] = classRanks(cls);
  const kind = classKind(cls);
  let m = 0.4 * (vsRandom()[cls] - 0.5);
  if (kind === 'pair') {
    if (hi >= 8) m += 0.02;
    else if (hi <= 4) m -= ip ? 0.01 : 0.04;
  } else {
    const gap = hi === 12 && lo <= 3 ? lo : hi - lo - 1;
    if (kind === 'suited') m += 0.07;
    if (gap === 0) m += 0.04;
    else if (gap === 1) m += 0.025;
    else if (gap === 2) m += 0.01;
    if (hi >= 8 && lo >= 8) m += 0.03;
    if (kind === 'offsuit') {
      if (lo <= 5 && gap >= 2) m -= ip ? 0.1 : 0.12;
      if (hi < 8 && gap >= 1) m -= 0.05;
    }
  }
  return Math.max(0.4, base + scale * m);
}

// ------------------------------------------------------------------ the heads-up preflop game

export class PreflopGame implements Game {
  readonly nodes: TreeNode[] = [];
  readonly n: [number, number] = [NUM_CLASSES, NUM_CLASSES];
  readonly reach: [Float64Array, Float64Array];
  /** Pot when the responder faces the open (used to express exploitability in % of pot). */
  readonly pot: number;
  readonly halfPot: number;
  readonly m: Matchup;
  /** Node ids: responder vs open, opener vs 3-bet, responder vs 4-bet, opener vs jam. */
  readonly ids: { vsOpen: number; vs3bet: number; vs4bet: number; vsJam: number };
  private share: Float64Array[][];
  private tmp = new Float64Array(NUM_CLASSES);

  constructor(m: Matchup, openerRange: ArrayLike<number>) {
    this.m = m;
    this.halfPot = m.dead / 2;
    this.reach = [Float64Array.from(openerRange), new Float64Array(NUM_CLASSES).fill(1)];
    const add = (n: Omit<TreeNode, 'id'>): number => {
      this.nodes.push({ ...n, id: this.nodes.length });
      return this.nodes.length - 1;
    };
    const base = { children: [] as number[], actions: [] as TreeAction[], raises: 0, street: 0 as const, ctx: 0, runout: -1 };
    const act = (player: number, inv: [number, number], parent: number, parentAction: number) => add({ ...base, children: [], actions: [], type: NODE_ACTION, player, inv, parent, parentAction });
    const fold = (player: number, inv: [number, number], parent: number, parentAction: number) => add({ ...base, type: 1, player, inv, parent, parentAction });
    const show = (term: number, inv: [number, number], parent: number, parentAction: number) => add({ ...base, type: 2, player: -1, inv, parent, parentAction, runout: term });
    const link = (id: number, a: TreeAction, child: number) => {
      this.nodes[id].actions.push(a);
      this.nodes[id].children.push(child);
    };
    const frac = (addAmt: number, inv: [number, number]) => addAmt / (m.dead + inv[0] + inv[1]);

    const invA: [number, number] = [m.open, m.posted[1]];
    const A = act(1, invA, -1, -1);
    link(A, { kind: 'fold', to: invA[1], add: 0, frac: 0 }, fold(1, invA, A, 0));
    link(A, { kind: 'call', to: m.open, add: m.open - invA[1], frac: 0 }, show(TERM_SRP, [m.open, m.open], A, 1));
    const invB: [number, number] = [m.open, m.threeBet];
    const B = act(0, invB, A, 2);
    link(A, { kind: 'raise', to: m.threeBet, add: m.threeBet - invA[1], frac: frac(m.threeBet - invA[1], invA) }, B);
    link(B, { kind: 'fold', to: m.open, add: 0, frac: 0 }, fold(0, invB, B, 0));
    link(B, { kind: 'call', to: m.threeBet, add: m.threeBet - m.open, frac: 0 }, show(TERM_3BP, [m.threeBet, m.threeBet], B, 1));
    const invC: [number, number] = [m.fourBet, m.threeBet];
    const C = act(1, invC, B, 2);
    link(B, { kind: 'raise', to: m.fourBet, add: m.fourBet - m.open, frac: frac(m.fourBet - m.open, invB) }, C);
    link(C, { kind: 'fold', to: m.threeBet, add: 0, frac: 0 }, fold(1, invC, C, 0));
    link(C, { kind: 'call', to: m.fourBet, add: m.fourBet - m.threeBet, frac: 0 }, show(TERM_4BP, [m.fourBet, m.fourBet], C, 1));
    const invD: [number, number] = [m.fourBet, STACK];
    const D = act(0, invD, C, 2);
    link(C, { kind: 'allin', to: STACK, add: STACK - m.threeBet, frac: frac(STACK - m.threeBet, invC) }, D);
    link(D, { kind: 'fold', to: m.fourBet, add: 0, frac: 0 }, fold(0, invD, D, 0));
    link(D, { kind: 'call', to: STACK, add: STACK - m.fourBet, frac: 0 }, show(TERM_ALLIN, [STACK, STACK], D, 1));
    this.ids = { vsOpen: A, vs3bet: B, vs4bet: C, vsJam: D };
    this.pot = m.dead + invA[0] + invA[1];

    // share[term][t][a * 169 + b] = compatible combos * t's realised pot share with class a vs class b.
    const E = classEquity();
    const Cm = classCompat();
    const N = NUM_CLASSES;
    this.share = [TERM_SRP, TERM_3BP, TERM_4BP, TERM_ALLIN].map((term) =>
      [0, 1].map((t) => {
        const out = new Float64Array(N * N);
        const tIp = m.ipPlayer === t;
        // A cold call with seats still to act risks a squeeze or a multiway pot: it realises less.
        const squeeze = (p: number) => (p === 1 && term !== TERM_ALLIN ? 1 - (term === TERM_SRP ? 0.06 : 0.02) * m.behind : 1);
        const st = squeeze(t);
        const so = squeeze(1 - t);
        for (let a = 0; a < N; a++) {
          const ra = realisation(a, tIp, term) * st;
          for (let b = 0; b < N; b++) {
            const c = Cm[a * N + b];
            if (c === 0) continue;
            const e = E[a * N + b];
            const rb = realisation(b, !tIp, term) * so;
            const x = e * ra;
            const y = (1 - e) * rb;
            out[a * N + b] = c * (x + y > 0 ? x / (x + y) : e);
          }
        }
        return out;
      }),
    );
  }

  oppMass(_t: number, reachOpp: ArrayLike<number>, out: Float64Array = new Float64Array(NUM_CLASSES)): Float64Array {
    const C = classCompat();
    const N = NUM_CLASSES;
    for (let a = 0; a < N; a++) {
      let s = 0;
      const row = a * N;
      for (let b = 0; b < N; b++) s += C[row + b] * reachOpp[b];
      out[a] = s;
    }
    return out;
  }

  showdownValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void {
    const S = this.share[node.runout][t];
    const N = NUM_CLASSES;
    const total = this.m.dead + node.inv[0] + node.inv[1];
    const lose = this.halfPot + node.inv[t];
    const mass = this.oppMass(t, reachOpp, this.tmp);
    for (let a = 0; a < N; a++) {
      let s = 0;
      const row = a * N;
      for (let b = 0; b < N; b++) s += S[row + b] * reachOpp[b];
      out[a] = total * s - lose * mass[a];
    }
  }
}

// ------------------------------------------------------------------ opening ranges


/** Equilibrium raise-first-in frequency per class for each opener (the "vs the field" model). */
export function rfiChart(pos: Position): Float64Array {
  const data = PREFLOP_SOLUTION.rfi[pos];
  if (!data) throw new Error(`${pos} cannot open`);
  return Float64Array.from(data, (x) => x / 255);
}

export interface PairSolution {
  game: PreflopGame;
  strat: StrategyFn;
}

const pairCache = new Map<string, PairSolution>();

/**
 * Solves a heads-up preflop game with CFR (used by the generator script and as a fallback). Classes a
 * player never brings to a node get that node's best-response action, so wider-than-equilibrium
 * villains still respond sensibly with hands the equilibrium never holds there.
 */
export function solvePair(m: Matchup, openerRange: ArrayLike<number>, opts: { maxIter?: number; targetPct?: number } = {}): PairSolution {
  const game = new PreflopGame(m, openerRange);
  const solver = new Solver(game);
  solver.solve({ maxIter: opts.maxIter ?? 2000, targetPct: opts.targetPct ?? 0.02, checkEvery: 100 });
  const strats = new Map<number, Float64Array>();
  for (const id of [game.ids.vsOpen, game.ids.vs3bet, game.ids.vs4bet, game.ids.vsJam]) strats.set(id, Float64Array.from(solver.avgStrategy(id)));
  const strat: StrategyFn = (id) => strats.get(id)!;
  for (const id of [game.ids.vsJam, game.ids.vs4bet, game.ids.vs3bet, game.ids.vsOpen]) {
    const node = game.nodes[id];
    const p = node.player;
    const r = solver.reachAt(id, strat);
    const vals = solver.actionValues(id, r[1 - p], 'br', strat);
    const s = strats.get(id)!;
    const nA = node.actions.length;
    for (let c = 0; c < NUM_CLASSES; c++) {
      if (r[p][c] > 1e-4) continue;
      let best = 0;
      for (let a = 1; a < nA; a++) if (vals[a][c] > vals[best][c]) best = a;
      for (let a = 0; a < nA; a++) s[a * NUM_CLASSES + c] = a === best ? 1 : 0;
    }
  }
  return { game, strat };
}

/** Equilibrium of the heads-up preflop game for two seats (from the shipped solution when available). */
export function pairSolution(a: Position, b: Position): PairSolution {
  const m = matchup(a, b);
  const key = `${m.opener}-${m.responder}`;
  const hit = pairCache.get(key);
  if (hit) return hit;
  const game = new PreflopGame(m, rfiChart(m.opener));
  const shipped = PREFLOP_SOLUTION.pairs[key as keyof typeof PREFLOP_SOLUTION.pairs] as number[][] | undefined;
  let sol: PairSolution;
  if (shipped) {
    const order = [game.ids.vsOpen, game.ids.vs3bet, game.ids.vs4bet, game.ids.vsJam];
    const strats = new Map<number, Float64Array>();
    order.forEach((id, k) => {
      const nA = game.nodes[id].actions.length;
      const q = shipped[k];
      const s = new Float64Array(nA * NUM_CLASSES);
      for (let c = 0; c < NUM_CLASSES; c++) {
        let sum = 0;
        for (let a = 0; a < nA; a++) sum += q[a * NUM_CLASSES + c];
        for (let a = 0; a < nA; a++) s[a * NUM_CLASSES + c] = sum > 0 ? q[a * NUM_CLASSES + c] / sum : 1 / nA;
      }
      strats.set(id, s);
    });
    sol = { game, strat: (id) => strats.get(id)! };
  } else {
    sol = solvePair(m, rfiChart(m.opener));
  }
  pairCache.set(key, sol);
  return sol;
}

/**
 * Value of opening each class (vs folding) against every seat still to act, each responding with
 * their heads-up strategy (multiway pots are ignored). The opener's later decisions use `heroMode`.
 */
export function openEv(
  solutions: { responder: Position; sol: PairSolution; strat: StrategyFn; heroMode: 'avg' | 'br' }[],
): Float64Array {
  const N = NUM_CLASSES;
  const ev = new Float64Array(N);
  const pReach = new Float64Array(N).fill(1);
  for (const { sol, strat, heroMode } of solutions) {
    const g = sol.game;
    const A = g.ids.vsOpen;
    const rR = g.reach[1];
    const v = new Solver(g).evaluate(A, 0, rR, heroMode, strat);
    const mass = g.oppMass(0, rR);
    const s = strat(A);
    const foldR = Float64Array.from(rR, (x, c) => x * s[c]);
    const fmass = g.oppMass(0, foldR);
    // What the opener collects in this heads-up game when the responder folds.
    const win = g.m.dead + g.m.posted[0] + g.m.posted[1];
    for (let c = 0; c < N; c++) {
      const evHU = mass[c] > 0 ? v[c] / mass[c] + g.halfPot + g.m.posted[0] : 0;
      const f = mass[c] > 0 ? fmass[c] / mass[c] : 1;
      ev[c] += pReach[c] * (evHU - f * win);
      pReach[c] *= f;
    }
  }
  for (let c = 0; c < N; c++) ev[c] += pReach[c] * BLINDS;
  return ev;
}

// ------------------------------------------------------------------ human tendencies preflop

/** Opening range of a villain profile: wider or tighter than equilibrium, keeping its strongest hands. */
export function profileRfi(profile: ProfileId, chart: ArrayLike<number>): Float64Array {
  const out = Float64Array.from(chart);
  const factor = profile === 'nit' ? 0.7 : profile === 'station' ? 1.3 : profile === 'fox' ? 1.15 : profile === 'maniac' ? 1.7 : 1;
  if (factor === 1) return out;
  const vr = vsRandom();
  const score = (c: number) => vr[c] + (classKind(c) === 'suited' ? (profile === 'fox' ? 0.06 : 0.025) : 0);
  const order = Array.from({ length: NUM_CLASSES }, (_, c) => c).sort((a, b) => score(b) - score(a));
  let mass = 0;
  for (let c = 0; c < NUM_CLASSES; c++) mass += chart[c] * classSize(c);
  const target = Math.min(1326, mass * factor);
  if (factor > 1) {
    let cur = mass;
    for (const c of order) {
      if (cur >= target) break;
      const room = (1 - out[c]) * classSize(c);
      const take = Math.min(room, target - cur);
      out[c] += take / classSize(c);
      cur += take;
    }
  } else {
    let cur = mass;
    for (const c of order.slice().reverse()) {
      if (cur <= target) break;
      const have = out[c] * classSize(c);
      const drop = Math.min(have, cur - target);
      out[c] -= drop / classSize(c);
      cur -= drop;
    }
  }
  return out;
}

/**
 * Shifts an equilibrium preflop strategy (facing a raise: fold / call / raise[ / jam]) toward a human
 * tendency. `pct` is each class's strength percentile against the opponent's range there.
 */
export function perturbPreflop(profile: ProfileId, node: TreeNode, sigma: Float64Array, pct: Float64Array): Float64Array {
  if (profile === 'gto') return sigma;
  const N = NUM_CLASSES;
  const out = Float64Array.from(sigma);
  const kinds = node.actions.map((a) => a.kind);
  const fold = kinds.indexOf('fold');
  const call = kinds.indexOf('call');
  const raise = kinds.findIndex((k) => k === 'raise' || k === 'allin');
  const move = (c: number, from: number, to: number, share: number) => {
    if (from < 0 || to < 0) return;
    const m = out[from * N + c] * share;
    out[from * N + c] -= m;
    out[to * N + c] += m;
  };
  const suited = (c: number) => classKind(c) === 'suited';
  for (let c = 0; c < N; c++) {
    const p = pct[c];
    if (profile === 'station') {
      move(c, fold, call, p > 0.15 ? 0.65 : 0.3);
      move(c, raise, call, p < 0.95 ? 0.7 : 0.3);
    } else if (profile === 'nit') {
      if (p < 0.65) move(c, call, fold, 0.6);
      if (p < 0.9) move(c, raise, p > 0.6 ? call : fold, 0.85);
    } else if (profile === 'fox') {
      if (p > 0.3 && p < 0.8 && suited(c)) move(c, fold, raise, 0.45);
      else if (p > 0.45 && p < 0.8) move(c, call, raise, 0.25);
    } else if (profile === 'maniac') {
      move(c, fold, raise, p > 0.25 ? 0.4 : 0.15);
      move(c, fold, call, 0.35);
      move(c, call, raise, 0.25);
    }
  }
  return out;
}
