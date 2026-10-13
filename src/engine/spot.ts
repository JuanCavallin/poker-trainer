import { rankOf, suitOf } from './cards';
import { NUM_CLASSES, NUM_COMBOS, classCombos, comboC1, comboC2, comboId } from './combos';
import { evaluateWith } from './evaluator';
import { describeHand } from './handinfo';
import { PostflopGame } from './postflop';
import {
  POSITIONS,
  STACK,
  classesToCombos,
  equityVsClasses,
  isEarlier,
  isOopVs,
  matchup,
  openEv,
  openersBefore,
  pairSolution,
  perturbPreflop,
  profileRfi,
  respondersAfter,
  rfiChart,
  vsRandom,
  PreflopGame,
  type Matchup,
  type Position,
} from './preflop';
import { PROFILES, perturb, type ProfileId } from './profiles';
import { Rng } from './rng';
import { Solver, type Game, type StrategyFn } from './solver';
import { classifyTexture, type TextureId } from './texture';
import { DEFAULT_TREE, NODE_ACTION, type StreetConfig, type TreeAction, type TreeNode } from './tree';
import {
  familyKey,
  isPreflopNode,
  type ActionKey,
  type ActionOption,
  type ActionTheory,
  type HistoryStreet,
  type LineStep,
  type NodeType,
  type PostflopNode,
  type PotType,
  type PreflopNode,
  type RangeView,
  type SpotPackage,
  type SpotRequest,
  type Street,
  type VillainHud,
} from './types';

const VIEW_MIN_WEIGHT = 0.01;
const r1 = (x: number) => Math.round(x * 10) / 10;
const BLINDS = 1.5;

// ------------------------------------------------------------------ betting trees and solve settings

/** The street being trained (and earlier streets when simulating the line): two sizes, one raise. */
const RICH: StreetConfig = { oopBets: [0.33, 0.75], ipBets: [0.33, 0.75], raiseMult: 3, maxRaises: 1, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 2 };
/** Streets after the decision street: one size, no raises (all-in only when short). */
const LEAN_TURN: StreetConfig = { oopBets: [0.66], ipBets: [0.66], raiseMult: 3, maxRaises: 0, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 1.5 };
const LEAN_RIVER: StreetConfig = { oopBets: [0.75], ipBets: [0.75], raiseMult: 3, maxRaises: 0, allinFrac: 0.7, allowAllin: true, allinMaxSpr: 1.5 };
/** Extra pot share for the player in position, per street not played out (equity realisation). */
const EDGE = 0.03;

// ------------------------------------------------------------------ small helpers

function dealCards(rng: Rng, count: number, used: readonly number[], texture?: TextureId): number[] | null {
  for (let tries = 0; tries < 800; tries++) {
    const board = used.slice();
    while (board.length < used.length + count) {
      const c = rng.int(52);
      if (!board.includes(c)) board.push(c);
    }
    // Quads or a five-card flush on board make degenerate spots where everyone chops.
    const rc = new Array(13).fill(0);
    const sc = [0, 0, 0, 0];
    for (const c of board) {
      rc[rankOf(c)]++;
      sc[suitOf(c)]++;
    }
    if (rc.some((n) => n >= 4) || sc.some((n) => n >= 5)) continue;
    if (!texture || classifyTexture(board).id === texture) return board;
  }
  return null;
}

function percentiles(values: ArrayLike<number>, weights: ArrayLike<number>): Float64Array {
  const n = values.length;
  const idx = Array.from({ length: n }, (_, i) => i).sort((a, b) => (values[a] || 0) - (values[b] || 0));
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

function actionKey(a: TreeAction): ActionKey {
  switch (a.kind) {
    case 'check':
      return 'check';
    case 'fold':
      return 'fold';
    case 'call':
      return 'call';
    case 'raise':
      return 'raise';
    case 'allin':
      return 'allin';
    default:
      return a.frac < 0.5 ? 'small' : 'big';
  }
}

function actionOption(a: TreeAction, facing: boolean, add: number, to: number): ActionOption {
  const key = actionKey(a);
  const pct = Math.round(a.frac * 100);
  let label: string;
  let short: string;
  switch (key) {
    case 'check':
      label = 'Check';
      short = 'Check';
      break;
    case 'fold':
      label = 'Fold';
      short = 'Fold';
      break;
    case 'call':
      label = `Call ${r1(add)}bb`;
      short = 'Call';
      break;
    case 'raise':
      label = `Raise to ${r1(to)}bb`;
      short = 'Raise';
      break;
    case 'allin':
      label = facing ? `All-in ${r1(to)}bb` : `All-in ${r1(add)}bb (${pct}%)`;
      short = 'All-in';
      break;
    default:
      label = `Bet ${pct}% · ${r1(add)}bb`;
      short = `Bet ${pct}%`;
  }
  return { key, kind: a.kind, label, short, add, to, frac: a.frac, aggressive: a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin' };
}

/** Weighted frequency with which the acting player takes action `k` given their reach. */
function freqAt(strat: StrategyFn, node: TreeNode, reach: ArrayLike<number>, k: number): number {
  const nP = reach.length;
  const s = strat(node.id);
  let num = 0;
  let den = 0;
  for (let i = 0; i < nP; i++) {
    num += reach[i] * s[k * nP + i];
    den += reach[i];
  }
  return den > 0 ? num / den : 0;
}

function permuteCard(c: number, perm: number[]): number {
  return rankOf(c) * 4 + perm[suitOf(c)];
}

function permuteRange(w: Float32Array, perm: number[]): Float32Array {
  const out = new Float32Array(NUM_COMBOS);
  for (let i = 0; i < NUM_COMBOS; i++) if (w[i] > 0) out[comboId(permuteCard(comboC1[i], perm), permuteCard(comboC2[i], perm))] = w[i];
  return out;
}

function applySuitPerm(spot: SpotPackage, perm: number[]): void {
  spot.board = spot.board.map((c) => permuteCard(c, perm));
  spot.history = spot.history.map((h) => ({ ...h, cards: h.cards.map((c) => permuteCard(c, perm)) }));
  spot.line = spot.line.map((s) => ({ ...s, board: s.board.map((c) => permuteCard(c, perm)), range: permuteRange(s.range, perm) }));
  for (const view of [spot.hero, spot.villain]) {
    for (let k = 0; k < view.n; k++) {
      const id = view.combos[k];
      view.combos[k] = comboId(permuteCard(comboC1[id], perm), permuteCard(comboC2[id], perm));
    }
  }
  spot.texture = classifyTexture(spot.board);
}

// ------------------------------------------------------------------ seats

const LEGACY: Record<string, { opener: Position; responder: Position; potType: 'SRP' | '3BP' }> = {
  'btn-bb': { opener: 'BTN', responder: 'BB', potType: 'SRP' },
  'co-btn': { opener: 'CO', responder: 'BTN', potType: 'SRP' },
  'sb-bb': { opener: 'SB', responder: 'BB', potType: 'SRP' },
  'btn-bb-3bp': { opener: 'BTN', responder: 'BB', potType: '3BP' },
};

/** How often each seat pair comes up when seats are random (heads-up pots are mostly blind-vs-steal). */
const PAIR_WEIGHT: Record<string, number> = {
  'BTN-BB': 5, 'CO-BB': 3, 'CO-BTN': 3, 'SB-BB': 3, 'UTG-BB': 2, 'HJ-BB': 2.5, 'BTN-SB': 2, 'HJ-BTN': 1.5,
  'UTG-BTN': 1, 'HJ-CO': 1, 'UTG-CO': 1, 'CO-SB': 1, 'UTG-HJ': 0.5, 'HJ-SB': 0.7, 'UTG-SB': 0.5,
};
const pairWeight = (a: Position, b: Position) => {
  const [o, r] = isEarlier(a, b) ? [a, b] : [b, a];
  return PAIR_WEIGHT[`${o}-${r}`] ?? 0.5;
};

/** Picks a villain seat for `hero` (or a hero seat for `villain`) satisfying `ok`. */
function pickPartner(rng: Rng, fixed: Position, ok: (other: Position) => boolean): Position | null {
  const opts = POSITIONS.filter((p) => p !== fixed && ok(p));
  if (!opts.length) return null;
  return rng.weighted(opts, opts.map((p) => pairWeight(fixed, p)));
}

function pickPair(rng: Rng): [Position, Position] {
  const keys = Object.keys(PAIR_WEIGHT);
  const k = rng.weighted(keys, keys.map((x) => PAIR_WEIGHT[x]));
  return k.split('-') as [Position, Position];
}

const MIRROR: Record<PostflopNode, PostflopNode> = { 'oop-first': 'ip-vs-check', 'ip-vs-check': 'oop-first', 'oop-vs-bet': 'ip-vs-bet', 'ip-vs-bet': 'oop-vs-bet' };

function resolvePostflopSeats(req: SpotRequest, rng: Rng): { hero: Position; villain: Position; nodeType: NodeType; potType: 'SRP' | '3BP' } {
  let hero = req.heroPos;
  let villain = req.villainPos;
  let potType = req.potType;
  let want = req.nodeType && !isPreflopNode(req.nodeType) ? req.nodeType : undefined;
  const wantOop = want ? want.startsWith('oop') : undefined;
  if (!hero && !villain && req.scenarioId && LEGACY[req.scenarioId]) {
    const L = LEGACY[req.scenarioId];
    potType ??= L.potType;
    const m = matchup(L.opener, L.responder);
    const oop = wantOop ?? rng.chance(0.5);
    hero = oop ? m.oop : m.ip;
    villain = oop ? m.ip : m.oop;
  }
  if (hero && villain && hero === villain) villain = undefined;
  if (hero && !villain) villain = pickPartner(rng, hero, (v) => wantOop == null || isOopVs(hero!, v) === wantOop) ?? pickPartner(rng, hero, () => true)!;
  else if (villain && !hero) hero = pickPartner(rng, villain, (h) => wantOop == null || isOopVs(h, villain!) === wantOop) ?? pickPartner(rng, villain, () => true)!;
  else if (!hero || !villain) {
    const [a, b] = pickPair(rng);
    const aOop = isOopVs(a, b);
    const heroOop = wantOop ?? rng.chance(0.5);
    [hero, villain] = heroOop === aOop ? [a, b] : [b, a];
  }
  const heroOop = isOopVs(hero, villain);
  if (want && want.startsWith('oop') !== heroOop) want = MIRROR[want];
  if (!want) want = heroOop ? rng.weighted<PostflopNode>(['oop-first', 'oop-vs-bet'], [0.4, 0.6]) : rng.weighted<PostflopNode>(['ip-vs-check', 'ip-vs-bet'], [0.55, 0.45]);
  potType ??= rng.chance(0.28) ? '3BP' : 'SRP';
  return { hero, villain, nodeType: want, potType };
}

function resolvePreflopSeats(req: SpotRequest, rng: Rng): { hero: Position; villain: Position; nodeType: PreflopNode } {
  let hero = req.heroPos;
  let villain = req.villainPos;
  let want = req.nodeType && isPreflopNode(req.nodeType) ? req.nodeType : undefined;
  if (hero === 'BB' && (want === 'rfi' || want === 'vs-3bet')) want = undefined;
  if (hero === 'UTG' && (want === 'vs-open' || want === 'vs-4bet')) want = undefined;
  const heroOpens = want ? want === 'rfi' || want === 'vs-3bet' : undefined;
  if (hero && villain && hero === villain) villain = undefined;
  if (hero && !villain) {
    villain = pickPartner(rng, hero, (v) => heroOpens == null || isEarlier(hero!, v) === heroOpens) ?? pickPartner(rng, hero, () => true)!;
  } else if (villain && !hero) {
    hero = pickPartner(rng, villain, (h) => heroOpens == null || isEarlier(h, villain!) === heroOpens) ?? pickPartner(rng, villain, () => true)!;
  } else if (!hero || !villain) {
    const [a, b] = pickPair(rng);
    const opens = heroOpens ?? rng.chance(0.5);
    [hero, villain] = opens ? [a, b] : [b, a];
  }
  const opens = isEarlier(hero, villain);
  if (want && (want === 'rfi' || want === 'vs-3bet') !== opens) want = undefined;
  if (!want) want = opens ? rng.weighted<PreflopNode>(['rfi', 'vs-3bet'], [0.55, 0.45]) : rng.weighted<PreflopNode>(['vs-open', 'vs-4bet'], [0.75, 0.25]);
  return { hero, villain, nodeType: want };
}

// ------------------------------------------------------------------ preflop play

/** Lazily perturbed strategy for the villain's nodes in a heads-up preflop game. */
function preflopStrategy(game: PreflopGame, base: StrategyFn, villain: 0 | 1, profile: ProfileId): StrategyFn {
  if (profile === 'gto') return base;
  const solver = new Solver(game);
  const cache = new Map<number, Float64Array>();
  const strat: StrategyFn = (id) => {
    const node = game.nodes[id];
    if (node.player !== villain) return base(id);
    const hit = cache.get(id);
    if (hit) return hit;
    const r = solver.reachAt(id, base);
    const eq = equityVsClasses(r[1 - villain]);
    const w = Float64Array.from(r[villain], (x, c) => x * classCombos[c].length);
    const out = perturbPreflop(profile, node, base(id), percentiles(eq, w));
    cache.set(id, out);
    return out;
  };
  return strat;
}

interface PreflopPlay {
  game: PreflopGame;
  strat: StrategyFn;
  eqStrat: StrategyFn;
  /** Class weights of opener (0) and responder (1) after the preflop action. */
  ranges: [Float64Array, Float64Array];
  steps: LineStep[];
  lines: string[];
  pot: number;
  stack: number;
}

/** The preflop action in seat order, e.g. ["UTG, HJ fold", "CO raises to 2.5bb", "BTN folds", "SB, BB fold"]. */
function preflopStory(m: Matchup, upTo: 'open' | 'srp' | '3bet' | '3bp' | '4bet'): string[] {
  const join = (ps: Position[]) => (ps.length ? [`${ps.join(', ')} fold${ps.length === 1 ? 's' : ''}`] : []);
  const before = POSITIONS.filter((p) => isEarlier(p, m.opener));
  const between = POSITIONS.filter((p) => isEarlier(m.opener, p) && isEarlier(p, m.responder));
  const after = POSITIONS.filter((p) => isEarlier(m.responder, p));
  const out = [...join(before), `${m.opener} raises to ${m.open}bb`, ...join(between)];
  if (upTo === 'open') return out;
  out.push(upTo === 'srp' ? `${m.responder} calls` : `${m.responder} 3-bets to ${m.threeBet}bb`);
  out.push(...join(after));
  if (upTo === '3bp') out.push(`${m.opener} calls`);
  if (upTo === '4bet') out.push(`${m.opener} 4-bets to ${m.fourBet}bb`);
  return out;
}

/** Plays the preflop of a postflop spot: who opened, who called or 3-bet, and the resulting ranges. */
function playPreflop(m: Matchup, potType: 'SRP' | '3BP', heroPlayer: 0 | 1, profile: ProfileId): PreflopPlay {
  const sol = pairSolution(m.opener, m.responder);
  const villain = (1 - heroPlayer) as 0 | 1;
  const open = villain === 0 ? profileRfi(profile, rfiChart(m.opener)) : rfiChart(m.opener);
  const game = villain === 0 && profile !== 'gto' ? new PreflopGame(m, open) : sol.game;
  const strat = preflopStrategy(game, sol.strat, villain, profile);
  const A = game.ids.vsOpen;
  const B = game.ids.vs3bet;
  const sA = strat(A);
  const actor = (p: 0 | 1) => (p === heroPlayer ? 'hero' : 'villain') as 'hero' | 'villain';
  const deadReal = BLINDS - m.posted[0] - m.posted[1];
  const steps: LineStep[] = [
    { street: 'preflop', actor: actor(0), pos: m.opener, text: `${m.opener} raises to ${m.open}bb`, verb: 'opening', board: [], range: classesToCombos(open) },
  ];
  let ranges: [Float64Array, Float64Array];
  let amount: number;
  if (potType === 'SRP') {
    const call = Float64Array.from({ length: NUM_CLASSES }, (_, c) => sA[NUM_CLASSES + c]);
    ranges = [Float64Array.from(open), call];
    steps.push({ street: 'preflop', actor: actor(1), pos: m.responder, text: `${m.responder} calls`, verb: 'calling the open', board: [], range: classesToCombos(call) });
    amount = m.open;
  } else {
    const three = Float64Array.from({ length: NUM_CLASSES }, (_, c) => sA[2 * NUM_CLASSES + c]);
    const sB = strat(B);
    const call = Float64Array.from(open, (x, c) => x * sB[NUM_CLASSES + c]);
    ranges = [call, three];
    steps.push({ street: 'preflop', actor: actor(1), pos: m.responder, text: `${m.responder} 3-bets to ${m.threeBet}bb`, verb: '3-betting', board: [], range: classesToCombos(three) });
    steps.push({ street: 'preflop', actor: actor(0), pos: m.opener, text: `${m.opener} calls`, verb: 'calling the 3-bet', board: [], range: classesToCombos(call) });
    amount = m.threeBet;
  }
  const lines = preflopStory(m, potType === 'SRP' ? 'srp' : '3bp');
  return { game, strat, eqStrat: sol.strat, ranges, steps, lines, pot: deadReal + 2 * amount, stack: STACK - amount };
}

// ------------------------------------------------------------------ postflop line simulation

/** Lazily perturbed villain strategy for a postflop game: a human tendency layered on the equilibrium. */
function postflopStrategy(game: PostflopGame, solver: Solver, villain: 0 | 1, profile: ProfileId): StrategyFn {
  const eq = solver.avgStrategy;
  if (profile === 'gto') return eq;
  const cache = new Map<number, Float64Array>();
  return (id) => {
    const node = game.nodes[id];
    if (node.player !== villain) return eq(id);
    const hit = cache.get(id);
    if (hit) return hit;
    const r = solver.reachAt(id, eq);
    const e = game.equity(villain, r[1 - villain], game.cardsAt(node), 6, 8);
    const out = perturb(profile, node, eq(id), percentiles(e, r[villain]), game.pot);
    cache.set(id, out);
    return out;
  };
}

function toCombos(game: PostflopGame, p: 0 | 1, reach: ArrayLike<number>): Float32Array {
  const out = new Float32Array(NUM_COMBOS);
  const h = game.hands[p];
  for (let i = 0; i < h.n; i++) out[h.combos[i]] = reach[i];
  return out;
}

const verbFor = (a: TreeAction, facing: boolean): string =>
  a.kind === 'check' ? 'checking' : a.kind === 'call' ? 'calling' : a.kind === 'raise' ? (facing ? 'raising' : 'betting') : a.kind === 'allin' ? 'going all-in' : `betting ${Math.round(a.frac * 100)}%`;

function describeAction(pos: string, a: TreeAction, streetInv: number): string {
  switch (a.kind) {
    case 'check':
      return `${pos} checks`;
    case 'call':
      return `${pos} calls`;
    case 'fold':
      return `${pos} folds`;
    case 'raise':
      return `${pos} raises to ${r1(a.to - streetInv)}bb`;
    case 'allin':
      return `${pos} goes all-in`;
    default:
      return `${pos} bets ${r1(a.add)}bb (${Math.round(a.frac * 100)}%)`;
  }
}

interface StreetPlay {
  ranges: [Float32Array, Float32Array];
  pot: number;
  stack: number;
  lines: string[];
  steps: LineStep[];
}

/**
 * Solves one earlier street (its betting, then a showdown over sampled runouts with a positional edge)
 * and samples a line from the solved strategies, villain tendencies included. Returns the ranges
 * once the street's betting closes.
 */
function playStreet(street: 'flop' | 'turn', board: number[], ranges: [Float32Array, Float32Array], pot: number, stack: number, hero: 0 | 1, profile: ProfileId, pos: [string, string], rng: Rng, seed: number): StreetPlay | null {
  const s = street === 'flop' ? 1 : 2;
  const game = new PostflopGame({
    board,
    pot,
    stack,
    ranges,
    streets: { [s]: RICH },
    lastStreet: s,
    leafTurns: 8,
    leafRivers: street === 'flop' ? 4 : 16,
    edge: EDGE,
    seed,
  });
  if (game.n[0] < 4 || game.n[1] < 4) return null;
  const solver = new Solver(game);
  solver.solve({ maxIter: 150, targetPct: 0.6, checkEvery: 25 });
  const villain = (1 - hero) as 0 | 1;
  const strat = postflopStrategy(game, solver, villain, profile);
  const reach: [Float64Array, Float64Array] = [Float64Array.from(game.reach[0]), Float64Array.from(game.reach[1])];
  const steps: LineStep[] = [];
  const lines: string[] = [];
  let node = game.nodes[0];
  while (node.type === NODE_ACTION) {
    const p = node.player as 0 | 1;
    const nP = game.n[p];
    const sg = strat(node.id);
    const opts = node.actions.map((a, k) => ({ a, k, f: a.kind === 'fold' || a.kind === 'allin' ? 0 : freqAt(strat, node, reach[p], k) }));
    const live = opts.filter((o) => o.f > 0.02);
    const pick = live.length ? rng.weighted(live, live.map((o) => o.f)) : opts.find((o) => o.a.kind === 'check' || o.a.kind === 'call')!;
    for (let i = 0; i < nP; i++) reach[p][i] *= sg[pick.k * nP + i];
    const facing = node.inv[1 - p] > node.inv[p];
    const text = describeAction(pos[p], pick.a, 0);
    lines.push(text);
    steps.push({ street, actor: p === hero ? 'hero' : 'villain', pos: pos[p], text, verb: verbFor(pick.a, facing), board: board.slice(), range: toCombos(game, p, reach[p]) });
    node = game.nodes[node.children[pick.k]];
  }
  const total = (r: Float64Array) => r.reduce((a, b) => a + b, 0);
  if (total(reach[0]) < 6 || total(reach[1]) < 6) return null;
  return {
    ranges: [toCombos(game, 0, reach[0]), toCombos(game, 1, reach[1])],
    pot: Math.round((pot + node.inv[0] + node.inv[1]) * 100) / 100,
    stack: Math.round((stack - node.inv[0]) * 100) / 100,
    lines,
    steps,
  };
}

// ------------------------------------------------------------------ packaging a decision

/** Hands of one player in a decision game, and how each maps to combos (one combo postflop, a class preflop). */
interface HandSpace {
  n: number;
  combosOf: (i: number) => readonly number[];
}

interface Decision {
  street: Street;
  game: Game;
  solver: Solver;
  eqStrat: StrategyFn;
  strat: StrategyFn;
  heroNode: number;
  hero: 0 | 1;
  vill: 0 | 1;
  board: number[];
  hands: [HandSpace, HandSpace];
  /** Equity of t's hands vs a weighted opponent range at the decision. */
  equity: (t: 0 | 1, reachOpp: ArrayLike<number>) => Float64Array;
  /** Chips put in before the decision street (so labels show street amounts). */
  realPot: (node: TreeNode) => number;
  mode: 'gto' | 'exploit';
  balance: boolean;
  model: string;
}

interface Packaged {
  heroView: RangeView;
  villView: RangeView;
  viewIdx: number[];
  rH: Float64Array;
  rV: Float64Array;
  strategy: Float32Array;
  gtoStrategy: Float32Array;
  ev: Float32Array;
  contEq: Float32Array;
  villainFold: number[];
  villainFoldEq: number[];
  freqs: number[];
  wsum: number;
  mixed: number;
}

function makeView(space: HandSpace, reach: ArrayLike<number>, equity: ArrayLike<number>, board: number[], strengthOf: (i: number, c1: number, c2: number) => number): { view: RangeView; idx: number[] } {
  const rows: { i: number; c: number }[] = [];
  const dead = new Set(board);
  for (let i = 0; i < space.n; i++) {
    if (reach[i] < VIEW_MIN_WEIGHT) continue;
    for (const c of space.combosOf(i)) if (!dead.has(comboC1[c]) && !dead.has(comboC2[c])) rows.push({ i, c });
  }
  const n = rows.length;
  const view: RangeView = {
    n,
    combos: new Int16Array(n),
    weights: new Float32Array(n),
    strength: new Int32Array(n),
    equity: new Float32Array(n),
    cat: new Uint8Array(n),
    flags: new Uint8Array(n),
  };
  rows.forEach(({ i, c }, k) => {
    view.combos[k] = c;
    view.weights[k] = Math.min(1, reach[i]);
    view.strength[k] = strengthOf(i, comboC1[c], comboC2[c]);
    view.equity[k] = Number.isFinite(equity[i]) ? equity[i] : 0;
    const d = describeHand(board, comboC1[c], comboC2[c]);
    view.cat[k] = d.cat;
    view.flags[k] = d.flags;
  });
  return { view, idx: rows.map((r) => r.i) };
}

function packageDecision(d: Decision): Packaged | null {
  const { solver, game, strat, eqStrat, heroNode, hero, vill, board } = d;
  const node = game.nodes[heroNode];
  const [rH, rV] = (() => {
    const r = solver.reachAt(heroNode, strat);
    return [r[hero], r[vill]];
  })();
  const nA = node.actions.length;
  const nH = game.n[hero];
  const nV = game.n[vill];

  const vals = solver.actionValues(heroNode, rV, d.mode === 'gto' ? 'avg' : 'br', strat);
  const mass = solver.oppMass(hero, rV);
  const evFull = new Float64Array(nH * nA);
  for (let i = 0; i < nH; i++) {
    for (let a = 0; a < nA; a++) evFull[i * nA + a] = mass[i] > 1e-9 ? vals[a][i] / mass[i] + solver.halfPot + node.inv[hero] : 0;
  }
  const eqS = eqStrat(heroNode);
  const gtoFull = new Float64Array(nH * nA);
  for (let i = 0; i < nH; i++) for (let a = 0; a < nA; a++) gtoFull[i * nA + a] = eqS[a * nH + i];
  let refFull = gtoFull;
  if (d.mode === 'exploit') {
    refFull = new Float64Array(nH * nA);
    const tol = 0.0005 * d.realPot(node);
    for (let i = 0; i < nH; i++) {
      let best = -Infinity;
      for (let a = 0; a < nA; a++) best = Math.max(best, evFull[i * nA + a]);
      let cnt = 0;
      for (let a = 0; a < nA; a++) if (evFull[i * nA + a] >= best - tol) cnt++;
      for (let a = 0; a < nA; a++) refFull[i * nA + a] = evFull[i * nA + a] >= best - tol ? 1 / cnt : 0;
    }
  }

  // Villain's continuing range after each hero action, for value/bluff classification.
  const contFull = new Float64Array(nH * nA).fill(NaN);
  const villainFold: number[] = node.actions.map(() => NaN);
  const villainFoldEq: number[] = node.actions.map(() => NaN);
  const foldShare = (s: Float64Array, f: number) => {
    let num = 0;
    let den = 0;
    for (let j = 0; j < nV; j++) {
      num += rV[j] * s[f * nV + j];
      den += rV[j];
    }
    return den > 0 ? num / den : NaN;
  };
  node.actions.forEach((a, k) => {
    const child = game.nodes[node.children[k]];
    if (!(a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') || child.type !== NODE_ACTION) return;
    const s = strat(child.id);
    const f = child.actions.findIndex((x) => x.kind === 'fold');
    const contW = new Float64Array(nV);
    for (let j = 0; j < nV; j++) contW[j] = rV[j] * (1 - s[f * nV + j]);
    const ce = d.equity(hero, contW);
    for (let i = 0; i < nH; i++) contFull[i * nA + k] = ce[i];
    villainFold[k] = foldShare(s, f);
    villainFoldEq[k] = foldShare(eqStrat(child.id), f);
  });

  const heroEq = d.equity(hero, rV);
  const villEq = d.equity(vill, rH);
  const strengthOf =
    d.street === 'preflop'
      ? (() => {
          const vr = vsRandom();
          return (i: number) => Math.round(vr[i] * 1e6);
        })()
      : (_i: number, c1: number, c2: number) => evaluateWith(board, c1, c2);
  const { view: heroView, idx: viewIdx } = makeView(d.hands[hero], rH, heroEq, board, strengthOf);
  const { view: villView } = makeView(d.hands[vill], rV, villEq, board, strengthOf);
  const total = (w: Float32Array) => w.reduce((s, x) => s + x, 0);
  if (heroView.n < 6 || villView.n < 4 || total(heroView.weights) < 5 || total(villView.weights) < 3) return null;

  const pick = (src: Float64Array) => {
    const out = new Float32Array(heroView.n * nA);
    viewIdx.forEach((i, k) => {
      for (let a = 0; a < nA; a++) out[k * nA + a] = src[i * nA + a];
    });
    return out;
  };
  const strategy = pick(refFull);
  const gtoStrategy = pick(gtoFull);
  const freqs = new Array(nA).fill(0);
  let wsum = 0;
  let mixed = 0;
  for (let k = 0; k < heroView.n; k++) {
    const w = heroView.weights[k];
    wsum += w;
    let mx = 0;
    for (let a = 0; a < nA; a++) {
      freqs[a] += w * strategy[k * nA + a];
      mx = Math.max(mx, gtoStrategy[k * nA + a]);
    }
    mixed += w * (1 - mx);
  }
  return {
    heroView,
    villView,
    viewIdx,
    rH,
    rV,
    strategy,
    gtoStrategy,
    ev: pick(evFull),
    contEq: pick(contFull),
    villainFold,
    villainFoldEq,
    freqs,
    wsum,
    mixed: mixed / wsum,
  };
}

function theoryFor(actions: ActionOption[], potAtNode: number, toCall: number, villainCall: (a: ActionOption) => number): SpotPackage['theory'] {
  const facing = toCall > 1e-9;
  const potBeforeBet = potAtNode - toCall;
  const perAction: (ActionTheory | null)[] = actions.map((a) => {
    if (!a.aggressive) return null;
    const X = a.add;
    const C = villainCall(a);
    return { bluffShare: C / (potAtNode + X + C), villainMdf: potAtNode / (potAtNode + X), alpha: X / (potAtNode + X) };
  });
  return {
    pot: potAtNode,
    toCall,
    requiredEquity: facing ? toCall / (potAtNode + toCall) : 0,
    mdf: facing ? potBeforeBet / potAtNode : 0,
    villainBetFrac: facing ? toCall / potBeforeBet : 0,
    villainBluffShare: facing ? toCall / (potAtNode + toCall) : 0,
    perAction,
  };
}

function difficultyOf(p: Packaged, facing: boolean, heroOop: boolean, mode: string, texture: TextureId, street: Street): number {
  const texBonus = texture === 'flush-river' || texture === 'straight-river' || texture === 'f-monotone' || texture === 't-flush' ? 0.08 : texture === 'connected' || texture === 'flushy' || texture === 'f-connected' || texture === 't-straight' ? 0.04 : 0;
  const streetBonus = street === 'flop' ? 0.06 : street === 'turn' ? 0.04 : street === 'preflop' ? -0.1 : 0;
  return Math.max(0, Math.min(1, 0.2 + 0.9 * p.mixed + (facing ? 0.1 : 0) + (heroOop ? 0.05 : 0) + (mode === 'exploit' ? 0.1 : 0) + texBonus + streetBonus));
}

function historyFrom(steps: LineStep[], preflopLines: string[], board: number[], street: Street, pots: Partial<Record<Street, number>>, decisionLines: string[]): HistoryStreet[] {
  const out: HistoryStreet[] = [{ street: 'Preflop', cards: [], pot: 0, lines: street === 'preflop' ? decisionLines : preflopLines }];
  const add = (s: 'flop' | 'turn' | 'river', name: HistoryStreet['street'], cards: number[]) => {
    const lines = s === street ? decisionLines : steps.filter((x) => x.street === s).map((x) => x.text);
    out.push({ street: name, cards, pot: pots[s] ?? 0, lines });
  };
  if (street === 'preflop') return out;
  add('flop', 'Flop', board.slice(0, 3));
  if (street === 'flop') return out;
  add('turn', 'Turn', [board[3]]);
  if (street === 'turn') return out;
  add('river', 'River', [board[4]]);
  return out;
}

// ------------------------------------------------------------------ preflop spots

const RAISE_NAME: Record<number, string> = { 0: 'Open', 1: '3-bet', 2: '4-bet', 3: 'Jam' };

function preflopOptions(node: TreeNode, level: number, realInv: number): ActionOption[] {
  return node.actions.map((a) => {
    const add = Math.max(0, a.to - realInv);
    if (a.kind === 'fold') return { key: 'fold', kind: a.kind, label: 'Fold', short: 'Fold', add: 0, to: realInv, frac: 0, aggressive: false };
    if (a.kind === 'call') return { key: 'call', kind: a.kind, label: `Call ${r1(add)}bb`, short: 'Call', add, to: a.to, frac: 0, aggressive: false };
    if (a.kind === 'allin') return { key: 'allin', kind: a.kind, label: `All-in ${r1(a.to)}bb`, short: 'Jam', add, to: a.to, frac: a.frac, aggressive: true };
    return { key: 'raise', kind: a.kind, label: `${RAISE_NAME[level]} to ${r1(a.to)}bb`, short: RAISE_NAME[level], add, to: a.to, frac: a.frac, aggressive: true };
  });
}

function tryPreflop(req: SpotRequest, rng: Rng, attempt: number): { spot: SpotPackage; ctx: SpotContext } | null {
  const seats = resolvePreflopSeats(req, rng);
  const profile = req.profile ?? 'gto';
  const { hero: heroPos, villain: villainPos, nodeType } = seats;
  const m = matchup(heroPos, villainPos);
  const hero = (heroPos === m.opener ? 0 : 1) as 0 | 1;
  const vill = (1 - hero) as 0 | 1;
  const mode = profile === 'gto' ? 'gto' : 'exploit';
  const lineSeed = req.lineSeed ?? rng.int(2 ** 31);
  const space: HandSpace = { n: NUM_CLASSES, combosOf: (i) => classCombos[i] };
  const vr = vsRandom();
  const strengthOf = (i: number) => Math.round(vr[i] * 1e6);
  const actorOf = (p: 0 | 1) => (p === hero ? 'hero' : 'villain') as 'hero' | 'villain';
  const deadReal = BLINDS - m.posted[0] - m.posted[1];
  const positions: [string, string] = [m.opener, m.responder];

  if (nodeType === 'rfi') {
    // Open or fold, valued against every seat still to act.
    const chart = rfiChart(m.opener);
    const behind = respondersAfter(m.opener);
    const sols = behind.map((r) => {
      const sol = pairSolution(m.opener, r);
      const strat = r === villainPos ? preflopStrategy(sol.game, sol.strat, 1, profile) : sol.strat;
      return { responder: r, sol, strat, heroMode: 'br' as const };
    });
    const evOpen = openEv(sols);
    const main = sols.find((s) => s.responder === villainPos)!;
    const g = main.sol.game;
    const nA = 2;
    const evFull = new Float64Array(NUM_CLASSES * nA);
    const gtoFull = new Float64Array(NUM_CLASSES * nA);
    const refFull = new Float64Array(NUM_CLASSES * nA);
    for (let c = 0; c < NUM_CLASSES; c++) {
      evFull[c * nA + 1] = evOpen[c];
      gtoFull[c * nA] = 1 - chart[c];
      gtoFull[c * nA + 1] = chart[c];
      if (mode === 'gto') {
        refFull[c * nA] = gtoFull[c * nA];
        refFull[c * nA + 1] = gtoFull[c * nA + 1];
      } else {
        const open = evOpen[c] > 0.0005 * BLINDS ? 1 : evOpen[c] < -0.0005 * BLINDS ? 0 : 0.5;
        refFull[c * nA] = 1 - open;
        refFull[c * nA + 1] = open;
      }
    }
    const all = new Float64Array(NUM_CLASSES).fill(1);
    // Hands that continue against the open, for value/bluff classification of the open itself.
    const sA = main.strat(g.ids.vsOpen);
    const cont = Float64Array.from({ length: NUM_CLASSES }, (_, c) => 1 - sA[c]);
    const contEqC = equityVsClasses(cont);
    const heroEq = vr;
    const { view: heroView, idx: viewIdx } = makeView(space, all, heroEq, [], strengthOf);
    const { view: villView } = makeView(space, all, vr, [], strengthOf);
    const pick = (src: Float64Array) => {
      const out = new Float32Array(heroView.n * nA);
      viewIdx.forEach((i, k) => {
        for (let a = 0; a < nA; a++) out[k * nA + a] = src[i * nA + a];
      });
      return out;
    };
    const contFull = new Float64Array(NUM_CLASSES * nA).fill(NaN);
    for (let c = 0; c < NUM_CLASSES; c++) contFull[c * nA + 1] = contEqC[c];
    let foldAll = 1;
    for (const s of sols) {
      const st = s.strat(s.sol.game.ids.vsOpen);
      let f = 0;
      let t = 0;
      for (let c = 0; c < NUM_CLASSES; c++) {
        f += st[c] * classCombos[c].length;
        t += classCombos[c].length;
      }
      foldAll *= f / t;
    }
    const open = m.open;
    const realInv = m.posted[0];
    const actions: ActionOption[] = [
      { key: 'fold', kind: 'fold', label: 'Fold', short: 'Fold', add: 0, to: realInv, frac: 0, aggressive: false },
      { key: 'raise', kind: 'raise', label: `Open to ${open}bb`, short: 'Open', add: open - realInv, to: open, frac: (open - realInv) / BLINDS, aggressive: true },
    ];
    const strategy = pick(refFull);
    const gtoStrategy = pick(gtoFull);
    let mixed = 0;
    let wsum = 0;
    for (let k = 0; k < heroView.n; k++) {
      wsum += heroView.weights[k];
      mixed += heroView.weights[k] * (1 - Math.max(gtoStrategy[k * nA], gtoStrategy[k * nA + 1]));
    }
    const notes = [`${behind.length} player${behind.length > 1 ? 's' : ''} still to act. Everyone folds about ${Math.round(foldAll * 100)}% of the time against an open.`];
    const hud: VillainHud | undefined =
      mode === 'exploit'
        ? {
            stats: [
              {
                label: 'Defends vs an open',
                value: 1 - foldShareOf(main.strat(g.ids.vsOpen)),
                baseline: 1 - foldShareOf(main.sol.strat(g.ids.vsOpen)),
              },
            ],
            notes: [PROFILES[profile].blurb, PROFILES[profile].exploit],
          }
        : undefined;
    const potAtNode = BLINDS;
    const spot: SpotPackage = {
      id: `${req.seed.toString(36)}-${attempt}-pf-${nodeType}-${heroPos}-${villainPos}-${profile}`,
      request: req,
      lineSeed,
      street: 'preflop',
      scenario: { id: `${m.opener}-${m.responder}`, name: `${m.opener} vs ${m.responder}`, potType: 'SRP', oopPos: m.oop, ipPos: m.ip },
      board: [],
      texture: classifyTexture([]),
      history: [{ street: 'Preflop', cards: [], pot: 0, lines: openersBefore(m.opener).length ? [`${openersBefore(m.opener).join(', ')} fold${openersBefore(m.opener).length === 1 ? 's' : ''}`] : ['You are first to act'] }],
      line: [],
      heroSide: hero,
      heroPos,
      villainPos,
      heroIp: m.ipPlayer === hero,
      nodeType,
      family: familyKey('preflop', nodeType, heroPos),
      profile,
      potStart: potAtNode,
      stackStart: STACK,
      pot: potAtNode,
      toCall: 0,
      heroInv: realInv,
      villainInv: m.posted[1],
      heroBehind: STACK - realInv,
      villainBehind: STACK - m.posted[1],
      villainAction: { kind: 'none', amount: 0, frac: 0, label: `Folds to you. ${villainPos} is still to act.` },
      actions,
      hero: heroView,
      villain: villView,
      theory: theoryFor(actions, potAtNode, 0, () => 0),
      solution: {
        mode,
        balance: false,
        strategy,
        gtoStrategy,
        ev: pick(evFull),
        contEq: pick(contFull),
        villainFold: [NaN, foldAll],
        iterations: 0,
        solverExplPct: 0,
        model: 'Open or fold against every seat still to act, each answering with its heads-up preflop equilibrium (169 hand classes, postflop valued by equity realisation).',
      },
      hud: hud ? { ...hud, notes: [...notes, ...hud.notes] } : { stats: [], notes },
      difficulty: Math.max(0, Math.min(1, 0.15 + 0.9 * (mixed / wsum))),
    };
    return { spot, ctx: { solver: new Solver(g), eqStrat: main.sol.strat, heroNode: -1, hero, vill, rH: new Float64Array(0), rV: new Float64Array(0), viewIdx, viewW: Array.from(heroView.weights), pot: potAtNode } };
  }

  const sol = pairSolution(m.opener, m.responder);
  const openRange = vill === 0 ? profileRfi(profile, rfiChart(m.opener)) : rfiChart(m.opener);
  const game = vill === 0 && profile !== 'gto' ? new PreflopGame(m, openRange) : sol.game;
  const strat = preflopStrategy(game, sol.strat, vill, profile);
  const ids = game.ids;
  const heroNode = nodeType === 'vs-open' ? ids.vsOpen : nodeType === 'vs-3bet' ? ids.vs3bet : ids.vs4bet;
  const solver = new Solver(game);
  const level = nodeType === 'vs-open' ? 1 : nodeType === 'vs-3bet' ? 2 : 3;

  // The line so far, with each actor's range after acting.
  const steps: LineStep[] = [];
  const pathNodes = nodeType === 'vs-open' ? [] : nodeType === 'vs-3bet' ? [ids.vsOpen] : [ids.vsOpen, ids.vs3bet];
  const openText = `${m.opener} raises to ${m.open}bb`;
  steps.push({ street: 'preflop', actor: actorOf(0), pos: m.opener, text: openText, verb: 'opening', board: [], range: classesToCombos(game.reach[0]) });
  for (const id of pathNodes) {
    const r = solver.reachAt(game.nodes[id].children[2], strat);
    const p = game.nodes[id].player as 0 | 1;
    const a = game.nodes[id].actions[2];
    const text = `${positions[p]} ${id === ids.vsOpen ? '3-bets' : '4-bets'} to ${r1(a.to)}bb`;
    steps.push({ street: 'preflop', actor: actorOf(p), pos: positions[p], text, verb: id === ids.vsOpen ? '3-betting' : '4-betting', board: [], range: classesToCombos(r[p]) });
  }

  const node = game.nodes[heroNode];
  const realPot = (n: TreeNode) => deadReal + n.inv[0] + n.inv[1];
  const d: Decision = {
    street: 'preflop',
    game,
    solver,
    eqStrat: sol.strat,
    strat,
    heroNode,
    hero,
    vill,
    board: [],
    hands: [space, space],
    equity: (_t, reachOpp) => equityVsClasses(reachOpp),
    realPot,
    mode,
    balance: mode === 'gto',
    model: 'Heads-up preflop game over the 169 hand classes (open, 3-bet, 4-bet, jam), postflop valued by equity realisation.',
  };
  const p = packageDecision(d);
  if (!p) return null;
  const potAtNode = realPot(node);
  const toCall = node.inv[vill] - node.inv[hero];
  const actions = preflopOptions(node, level, node.inv[hero]);
  const va = game.nodes[node.parent];
  const vAct = va ? va.actions[node.parentAction] : null;
  const villainAction: SpotPackage['villainAction'] = vAct
    ? { kind: 'bet', amount: vAct.add, frac: vAct.frac, label: `${villainPos} ${nodeType === 'vs-3bet' ? '3-bets' : '4-bets'} to ${r1(vAct.to)}bb` }
    : { kind: 'bet', amount: m.open, frac: m.open / BLINDS, label: `${villainPos} opens to ${m.open}bb` };
  const heroPrior = nodeType === 'vs-3bet' ? `You opened to ${m.open}bb` : nodeType === 'vs-4bet' ? `You 3-bet to ${m.threeBet}bb` : undefined;
  const story = preflopStory(m, nodeType === 'vs-open' ? 'open' : nodeType === 'vs-3bet' ? '3bet' : '4bet');

  let hud: VillainHud | undefined;
  if (mode === 'exploit') {
    const stats: VillainHud['stats'] = [];
    node.actions.forEach((a, k) => {
      if (a.kind !== 'raise' && a.kind !== 'allin') return;
      const c = node.children[k];
      if (game.nodes[c].type !== NODE_ACTION) return;
      stats.push({ label: `Folds to your ${actions[k].short.toLowerCase()}`, value: p.villainFold[k], baseline: p.villainFoldEq[k] });
    });
    if (va) {
      const rr = solver.reachAt(va.id, strat)[vill];
      const re = solver.reachAt(va.id, sol.strat)[vill];
      const w = (r: Float64Array) => Array.from(r, (x, c) => x * classCombos[c].length);
      stats.push({ label: `${level === 2 ? '3-bets' : '4-bets'} when given the chance`, value: freqAt(strat, va, w(rr), 2), baseline: freqAt(sol.strat, va, w(re), 2) });
    } else {
      const total = (r: ArrayLike<number>) => Array.from(r).reduce((s, x, c) => s + x * classCombos[c].length, 0);
      stats.push({ label: `Opens from ${villainPos}`, value: total(openRange) / 1326, baseline: total(rfiChart(m.opener)) / 1326 });
    }
    hud = { stats, notes: [PROFILES[profile].blurb, PROFILES[profile].exploit] };
  }

  const spot: SpotPackage = {
    id: `${req.seed.toString(36)}-${attempt}-pf-${nodeType}-${heroPos}-${villainPos}-${profile}`,
    request: req,
    lineSeed,
    street: 'preflop',
    scenario: { id: `${m.opener}-${m.responder}`, name: `${m.opener} vs ${m.responder}`, potType: level === 1 ? 'SRP' : level === 2 ? '3BP' : '4BP', oopPos: m.oop, ipPos: m.ip },
    board: [],
    texture: classifyTexture([]),
    history: [{ street: 'Preflop', cards: [], pot: 0, lines: story }],
    line: steps,
    heroSide: hero,
    heroPos,
    villainPos,
    heroIp: m.ipPlayer === hero,
    nodeType,
    family: familyKey('preflop', nodeType, heroPos),
    profile,
    potStart: deadReal + m.posted[0] + m.posted[1],
    stackStart: STACK,
    pot: potAtNode,
    toCall,
    heroInv: node.inv[hero],
    villainInv: node.inv[vill],
    heroBehind: STACK - node.inv[hero],
    villainBehind: STACK - node.inv[vill],
    villainAction,
    heroPrior,
    actions,
    hero: p.heroView,
    villain: p.villView,
    theory: theoryFor(actions, potAtNode, toCall, (a) => a.to - node.inv[vill]),
    solution: {
      mode,
      balance: mode === 'gto',
      strategy: p.strategy,
      gtoStrategy: p.gtoStrategy,
      ev: p.ev,
      contEq: p.contEq,
      villainFold: p.villainFold,
      iterations: 0,
      solverExplPct: 0,
      model: d.model,
    },
    hud,
    difficulty: difficultyOf(p, true, m.ipPlayer !== hero, mode, 'preflop', 'preflop'),
  };
  return { spot, ctx: { solver, eqStrat: sol.strat, heroNode, hero, vill, rH: p.rH, rV: p.rV, viewIdx: p.viewIdx, viewW: Array.from(p.heroView.weights), pot: potAtNode } };
}

function foldShareOf(s: Float64Array): number {
  let f = 0;
  for (let c = 0; c < NUM_CLASSES; c++) f += s[c] * classCombos[c].length;
  return f / 1326;
}

// ------------------------------------------------------------------ postflop spots

function decisionGame(street: 'flop' | 'turn' | 'river', board: number[], ranges: [Float32Array, Float32Array], pot: number, stack: number, seed: number): { game: PostflopGame; solver: Solver; model: string } {
  const probe = (minW: number) => {
    let n = 0;
    for (const r of ranges) for (let i = 0; i < NUM_COMBOS; i++) if (r[i] > minW) n++;
    return n;
  };
  const width = probe(0.004);
  let game: PostflopGame;
  let model: string;
  let iters: { maxIter: number; targetPct: number; checkEvery: number };
  if (street === 'river') {
    game = new PostflopGame({ board, pot, stack, ranges, streets: { 3: DEFAULT_TREE }, lastStreet: 3, seed });
    model = 'River solved exactly for this betting tree (bets of 33%, 75% or all-in, one raise).';
    iters = { maxIter: 1200, targetPct: 0.12, checkEvery: 50 };
  } else if (street === 'turn') {
    const dealRiver = width <= 300 ? 0 : width <= 600 ? 24 : width <= 1000 ? 16 : 12;
    game = new PostflopGame({ board, pot, stack, ranges, streets: { 2: RICH, 3: LEAN_RIVER }, lastStreet: 3, dealRiver, seed });
    model = `Turn solved with river play on ${dealRiver ? `${dealRiver} sampled` : 'every'} river card${dealRiver ? 's' : ''} (turn: 33%/75% bets and a raise; river: 75% bets).`;
    iters = { maxIter: 250, targetPct: 0.35, checkEvery: 20 };
  } else {
    const dealTurn = width <= 700 ? 7 : width <= 1100 ? 6 : 5;
    game = new PostflopGame({ board, pot, stack, ranges, streets: { 1: RICH, 2: LEAN_TURN }, lastStreet: 2, dealTurn, leafRivers: 5, edge: EDGE, seed });
    model = `Flop solved with turn play on ${dealTurn} sampled turn cards (flop: 33%/75% bets and a raise; turn: 66% bets); the river is a showdown over sampled cards with a small edge for position.`;
    iters = { maxIter: 200, targetPct: 0.5, checkEvery: 25 };
  }
  const solver = new Solver(game);
  solver.solve(iters);
  return { game, solver, model };
}

function tryPostflop(req: SpotRequest, rng: Rng, attempt: number, street: 'flop' | 'turn' | 'river'): { spot: SpotPackage; ctx: SpotContext } | null {
  const seats = resolvePostflopSeats(req, rng);
  const nodeType = seats.nodeType;
  const profile = req.profile ?? 'gto';
  const m = matchup(seats.hero, seats.villain);
  const heroPre = (seats.hero === m.opener ? 0 : 1) as 0 | 1;
  const nCards = street === 'flop' ? 3 : street === 'turn' ? 4 : 5;
  const board = req.board && req.board.length === nCards ? req.board.slice() : dealCards(rng, nCards, [], req.texture);
  if (!board) return null;
  const hero = (seats.hero === m.oop ? 0 : 1) as 0 | 1;
  const vill = (1 - hero) as 0 | 1;
  const positions: [string, string] = [m.oop, m.ip];
  const lineSeed = req.lineSeed != null && attempt === 0 ? req.lineSeed : rng.int(2 ** 31);
  const lineRng = new Rng(lineSeed);

  // Preflop: ranges from the heads-up preflop equilibrium, with the villain's tendencies.
  const pre = playPreflop(m, seats.potType, heroPre, profile);
  const oopPre = (1 - m.ipPlayer) as 0 | 1;
  let ranges: [Float32Array, Float32Array] = [classesToCombos(pre.ranges[oopPre]), classesToCombos(pre.ranges[m.ipPlayer])];
  let pot = pre.pot;
  let stack = pre.stack;
  const steps: LineStep[] = [...pre.steps];
  const pots: Partial<Record<Street, number>> = { flop: pot };

  // Earlier streets: solve each and follow one line through it.
  if (street !== 'flop') {
    const f = playStreet('flop', board.slice(0, 3), ranges, pot, stack, hero, profile, positions, lineRng, lineSeed ^ 0x51ed);
    if (!f) return null;
    ranges = f.ranges;
    pot = f.pot;
    stack = f.stack;
    steps.push(...f.steps);
    pots.turn = pot;
    if (street === 'river') {
      const t = playStreet('turn', board.slice(0, 4), ranges, pot, stack, hero, profile, positions, lineRng, lineSeed ^ 0x7a11);
      if (!t) return null;
      ranges = t.ranges;
      pot = t.pot;
      stack = t.stack;
      steps.push(...t.steps);
      pots.river = pot;
    }
  }
  if (stack < 1) return null;

  const { game, solver, model } = decisionGame(street, board, ranges, pot, stack, lineSeed ^ 0x2b3c);
  if (game.n[0] < 4 || game.n[1] < 4) return null;
  const eqStrat = solver.avgStrategy;
  const strat = postflopStrategy(game, solver, vill, profile);
  const mode = profile === 'gto' ? 'gto' : 'exploit';

  // Locate the hero's decision.
  const nodes = game.nodes;
  const root = nodes[0];
  let heroNode: number;
  let villainNodeId = -1;
  let villainActionIdx = -1;
  const rootReach = game.reach;
  if (nodeType === 'oop-first') heroNode = 0;
  else if (nodeType === 'ip-vs-check') {
    if (freqAt(strat, root, rootReach[0], 0) < 0.12) return null;
    heroNode = root.children[0];
    villainNodeId = 0;
    villainActionIdx = 0;
  } else {
    const at = nodeType === 'ip-vs-bet' ? 0 : root.children[0];
    if (nodeType === 'oop-vs-bet' && freqAt(eqStrat, root, rootReach[0], 0) < 0.15) return null;
    const node = nodes[at];
    const rv = solver.reachAt(at, strat)[vill];
    const cands = node.actions.map((a, k) => ({ k, f: a.kind === 'check' ? 0 : freqAt(strat, node, rv, k) })).filter((c) => c.f >= 0.05);
    if (!cands.length) return null;
    const vf = req.villainFrac;
    const pick =
      vf != null ? cands.reduce((best, c) => (Math.abs(node.actions[c.k].frac - vf) < Math.abs(node.actions[best.k].frac - vf) ? c : best)) : rng.weighted(cands, cands.map((c) => c.f));
    heroNode = node.children[pick.k];
    villainNodeId = at;
    villainActionIdx = pick.k;
  }

  const handsOf = (p: 0 | 1): HandSpace => ({ n: game.n[p], combosOf: (i) => [game.hands[p].combos[i]] });
  const d: Decision = {
    street,
    game,
    solver,
    eqStrat,
    strat,
    heroNode,
    hero,
    vill,
    board,
    hands: [handsOf(0), handsOf(1)],
    equity: (t, reachOpp) => game.equity(t, reachOpp, board, 12, 8),
    realPot: (n) => pot + n.inv[0] + n.inv[1],
    mode,
    balance: mode === 'gto',
    model,
  };
  const p = packageDecision(d);
  if (!p) return null;
  // Skip spots where one action does everything.
  if (p.freqs.filter((f) => f / p.wsum >= 0.04).length < 2 && attempt < 25) return null;

  const node = nodes[heroNode];
  const potAtNode = pot + node.inv[0] + node.inv[1];
  const toCall = node.inv[vill] - node.inv[hero];
  const facing = toCall > 1e-9;
  const actions = node.actions.map((a) => actionOption(a, facing, a.add, a.to));

  let villainAction: SpotPackage['villainAction'] = { kind: 'none', amount: 0, frac: 0, label: 'Villain has not acted yet on this street' };
  if (villainNodeId >= 0) {
    const va = nodes[villainNodeId].actions[villainActionIdx];
    if (va.kind === 'check') villainAction = { kind: 'check', amount: 0, frac: 0, label: 'Villain checks' };
    else
      villainAction = {
        kind: va.kind === 'allin' ? 'allin' : 'bet',
        amount: va.add,
        frac: va.frac,
        label: va.kind === 'allin' ? `Villain moves all-in for ${r1(va.add)}bb (${Math.round(va.frac * 100)}% pot)` : `Villain bets ${r1(va.add)}bb (${Math.round(va.frac * 100)}% pot)`,
      };
  }

  // Lines and line steps on the decision street before the hero acts.
  const decisionLines: string[] = [];
  const streetCards = board.slice();
  const pushStep = (p: 0 | 1, nodeId: number, k: number) => {
    const n = nodes[nodeId];
    const a = n.actions[k];
    const text = describeAction(positions[p], a, 0);
    decisionLines.push(text);
    const r = solver.reachAt(n.children[k], strat)[p];
    steps.push({ street, actor: p === hero ? 'hero' : 'villain', pos: positions[p], text, verb: verbFor(a, n.inv[1 - p] > n.inv[p]), board: streetCards, range: toCombos(game, p, r) });
  };
  if (nodeType === 'ip-vs-check') pushStep(vill, 0, 0);
  if (nodeType === 'ip-vs-bet') pushStep(vill, 0, villainActionIdx);
  if (nodeType === 'oop-vs-bet') {
    pushStep(hero, 0, 0);
    pushStep(vill, villainNodeId, villainActionIdx);
  }

  let hud: VillainHud | undefined;
  if (mode === 'exploit') {
    const stats: VillainHud['stats'] = [];
    const aggr = node.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.kind !== 'check' && a.kind !== 'fold' && a.kind !== 'call');
    if (aggr.length) {
      const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
      stats.push({
        label: facing ? 'Folds to your raise' : 'Folds to your bet',
        value: avg(aggr.map(({ k }) => p.villainFold[k])),
        baseline: avg(aggr.map(({ k }) => p.villainFoldEq[k])),
      });
    }
    if (villainNodeId >= 0) {
      const vn = nodes[villainNodeId];
      const checkIdx = vn.actions.findIndex((a) => a.kind === 'check');
      const rr = (s: StrategyFn) => solver.reachAt(villainNodeId, s)[vill];
      const betFreq = (s: StrategyFn) => 1 - freqAt(s, vn, rr(s), checkIdx);
      stats.push({ label: villainNodeId === 0 ? 'Bets when first to act' : 'Bets when checked to', value: betFreq(strat), baseline: betFreq(eqStrat) });
    }
    hud = { stats, notes: [PROFILES[profile].blurb, PROFILES[profile].exploit] };
  }

  const texture = classifyTexture(board);
  const potLabel: PotType = seats.potType;
  const spot: SpotPackage = {
    id: `${req.seed.toString(36)}-${attempt}-${lineSeed.toString(36)}-${board.join('.')}-${seats.hero}${seats.villain}${seats.potType}${req.suitPerm ? '-' + req.suitPerm.join('') : ''}-${profile}`,
    request: req,
    lineSeed,
    street,
    scenario: { id: `${m.opener}-${m.responder}${seats.potType === '3BP' ? '-3bp' : ''}`, name: `${m.opener} vs ${m.responder}`, potType: potLabel, oopPos: m.oop, ipPos: m.ip },
    board,
    texture,
    history: historyFrom(steps, pre.lines, board, street, pots, decisionLines),
    line: steps,
    heroSide: hero,
    heroPos: seats.hero,
    villainPos: seats.villain,
    heroIp: hero === 1,
    nodeType,
    family: familyKey(street, nodeType, texture.id),
    profile,
    potStart: pot,
    stackStart: stack,
    pot: potAtNode,
    toCall,
    heroInv: node.inv[hero],
    villainInv: node.inv[vill],
    heroBehind: stack - node.inv[hero],
    villainBehind: stack - node.inv[vill],
    villainAction,
    heroPrior: nodeType === 'oop-vs-bet' ? 'You checked' : undefined,
    actions,
    hero: p.heroView,
    villain: p.villView,
    theory: theoryFor(actions, potAtNode, toCall, (a) => a.to - node.inv[vill]),
    solution: {
      mode,
      balance: mode === 'gto',
      strategy: p.strategy,
      gtoStrategy: p.gtoStrategy,
      ev: p.ev,
      contEq: p.contEq,
      villainFold: p.villainFold,
      iterations: solver.iterations,
      solverExplPct: solver.exploitabilityPct(),
      model,
    },
    hud,
    difficulty: difficultyOf(p, facing, hero === 0, mode, texture.id, street),
  };
  if (req.suitPerm) applySuitPerm(spot, req.suitPerm);
  return { spot, ctx: { solver, eqStrat, heroNode, hero, vill, rH: p.rH, rV: p.rV, viewIdx: p.viewIdx, viewW: Array.from(p.heroView.weights), pot: potAtNode } };
}

// ------------------------------------------------------------------ entry points

/** Solver state kept by the worker so a submitted range can be scored against a best response. */
export interface SpotContext {
  solver: Solver;
  eqStrat: StrategyFn;
  /** -1 when the spot has no balance score (open-or-fold spots). */
  heroNode: number;
  hero: 0 | 1;
  vill: 0 | 1;
  rH: Float64Array;
  rV: Float64Array;
  /** Hero view row -> hand index in the game (several rows share a class preflop). */
  viewIdx: number[];
  viewW: number[];
  pot: number;
}

export function streetOf(req: SpotRequest): Street {
  if (req.street) return req.street;
  if (req.nodeType && isPreflopNode(req.nodeType)) return 'preflop';
  return 'river';
}

export function generateSpotWithContext(req: SpotRequest): { spot: SpotPackage; ctx: SpotContext } {
  const rng = new Rng(req.seed);
  const street = streetOf(req);
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = street === 'preflop' ? tryPreflop(req, rng, attempt) : tryPostflop(req, rng, attempt, street);
    if (res) return res;
  }
  throw new Error('Could not find a spot matching these filters. Try loosening them.');
}

export const generateSpot = (req: SpotRequest): SpotPackage => generateSpotWithContext(req).spot;

/**
 * How much more a perfectly adapting villain wins against the user's range at this node than
 * against the equilibrium range, in % of the pot. `user` uses the hero view layout (k * nA + a),
 * with each row already summing to 1.
 */
export function exploitabilityGapPct(ctx: SpotContext, user: Float32Array): number {
  const { solver, eqStrat, heroNode, hero, vill, rH, rV, viewIdx, viewW } = ctx;
  if (heroNode < 0) return 0;
  const node = solver.nodes[heroNode];
  const nA = node.actions.length;
  const nH = solver.game.n[hero];
  const override = Float64Array.from(eqStrat(heroNode));
  const sums = new Float64Array(nA * nH);
  const wts = new Float64Array(nH);
  viewIdx.forEach((i, k) => {
    let sum = 0;
    for (let a = 0; a < nA; a++) sum += user[k * nA + a];
    if (sum <= 0) return;
    const w = viewW[k] || 1;
    for (let a = 0; a < nA; a++) sums[a * nH + i] += (w * user[k * nA + a]) / sum;
    wts[i] += w;
  });
  for (let i = 0; i < nH; i++) {
    if (wts[i] <= 0) continue;
    for (let a = 0; a < nA; a++) override[a * nH + i] = sums[a * nH + i] / wts[i];
  }
  const userStrat: StrategyFn = (id) => (id === heroNode ? override : eqStrat(id));
  const vUser = solver.evaluate(heroNode, vill, rH, 'br', userStrat);
  const vEq = solver.evaluate(heroNode, vill, rH, 'br', eqStrat);
  let gainUser = 0;
  let gainEq = 0;
  for (let j = 0; j < vUser.length; j++) {
    gainUser += rV[j] * vUser[j];
    gainEq += rV[j] * vEq[j];
  }
  const mass = solver.oppMass(hero, rV);
  let z = 0;
  for (let i = 0; i < nH; i++) z += rH[i] * mass[i];
  if (z <= 0) return 0;
  return Math.max(0, ((gainUser - gainEq) / z / ctx.pot) * 100);
}
