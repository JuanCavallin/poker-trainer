import { rankOf, suitOf } from './cards';
import { NUM_COMBOS, comboC1, comboC2, comboId } from './combos';
import { equityVsRange, makeHandList, type HandList } from './equity';
import { describeHand } from './handinfo';
import { simulateStreets } from './narrowing';
import { SCENARIOS, scenarioById } from './preflop';
import { PROFILES, perturb } from './profiles';
import { Rng } from './rng';
import { RiverSolver, type StrategyFn } from './solver';
import { classifyTexture, type TextureId } from './texture';
import { DEFAULT_TREE, NODE_ACTION, buildTree, type TreeAction, type TreeNode } from './tree';
import {
  NODE_TYPES,
  familyKey,
  type ActionKey,
  type ActionOption,
  type ActionTheory,
  type NodeType,
  type RangeView,
  type SpotPackage,
  type SpotRequest,
  type VillainHud,
} from './types';

const SOLVER_MIN_WEIGHT = 0.004;
const VIEW_MIN_WEIGHT = 0.01;
const r1 = (x: number) => Math.round(x * 10) / 10;

function dealBoard(rng: Rng, texture?: TextureId): number[] | null {
  for (let tries = 0; tries < 800; tries++) {
    const board: number[] = [];
    while (board.length < 5) {
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

function percentiles(values: Float64Array, weights: ArrayLike<number>): Float64Array {
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

function actionOption(a: TreeAction, facing: boolean): ActionOption {
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
      label = `Call ${r1(a.add)}bb`;
      short = 'Call';
      break;
    case 'raise':
      label = `Raise to ${r1(a.to)}bb`;
      short = 'Raise';
      break;
    case 'allin':
      label = facing ? `All-in ${r1(a.to)}bb` : `All-in ${r1(a.add)}bb (${pct}%)`;
      short = 'All-in';
      break;
    default:
      label = `Bet ${pct}% · ${r1(a.add)}bb`;
      short = `Bet ${pct}%`;
  }
  return { key, kind: a.kind, label, short, add: a.add, to: a.to, frac: a.frac, aggressive: a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin' };
}

/** Weighted frequency with which `player` takes action `k` at `nodeId`. */
function actionFreq(solver: RiverSolver, strat: StrategyFn, nodeId: number, k: number): number {
  const node = solver.nodes[nodeId];
  const p = node.player;
  const r = solver.reachAt(nodeId, strat)[p];
  const s = strat(nodeId);
  const nP = solver.hands[p].n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < nP; i++) {
    num += r[i] * s[k * nP + i];
    den += r[i];
  }
  return den > 0 ? num / den : 0;
}

function foldFreq(solver: RiverSolver, strat: StrategyFn, nodeId: number, reach: ArrayLike<number>): number {
  const node = solver.nodes[nodeId];
  if (node.type !== NODE_ACTION) return NaN;
  const f = node.actions.findIndex((a) => a.kind === 'fold');
  if (f < 0) return NaN;
  const nP = solver.hands[node.player].n;
  const s = strat(nodeId);
  let num = 0;
  let den = 0;
  for (let i = 0; i < nP; i++) {
    num += reach[i] * s[f * nP + i];
    den += reach[i];
  }
  return den > 0 ? num / den : NaN;
}

function makeView(hands: HandList, reach: Float64Array, equity: Float64Array, board: number[]): RangeView {
  const keep: number[] = [];
  for (let i = 0; i < hands.n; i++) if (reach[i] >= VIEW_MIN_WEIGHT) keep.push(i);
  const n = keep.length;
  const view: RangeView = {
    n,
    combos: new Int16Array(n),
    weights: new Float32Array(n),
    strength: new Int32Array(n),
    equity: new Float32Array(n),
    cat: new Uint8Array(n),
    flags: new Uint8Array(n),
  };
  keep.forEach((i, k) => {
    view.combos[k] = hands.combos[i];
    view.weights[k] = Math.min(1, reach[i]);
    view.strength[k] = hands.strength[i];
    view.equity[k] = Number.isFinite(equity[i]) ? equity[i] : 0;
    const d = describeHand(board, hands.c1[i], hands.c2[i]);
    view.cat[k] = d.cat;
    view.flags[k] = d.flags;
  });
  return view;
}

function permuteCard(c: number, perm: number[]): number {
  return rankOf(c) * 4 + perm[suitOf(c)];
}

function applySuitPerm(spot: SpotPackage, perm: number[]): void {
  spot.board = spot.board.map((c) => permuteCard(c, perm));
  spot.history = spot.history.map((h) => ({ ...h, cards: h.cards.map((c) => permuteCard(c, perm)) }));
  for (const view of [spot.hero, spot.villain]) {
    for (let k = 0; k < view.n; k++) {
      const id = view.combos[k];
      view.combos[k] = comboId(permuteCard(comboC1[id], perm), permuteCard(comboC2[id], perm));
    }
  }
  spot.texture = classifyTexture(spot.board);
}

function tryGenerate(req: SpotRequest, rng: Rng, attempt: number): { spot: SpotPackage; ctx: SpotContext } | null {
  const sc = req.scenarioId ? scenarioById(req.scenarioId) : rng.weighted(SCENARIOS, [0.4, 0.2, 0.25, 0.15]);
  const nodeType: NodeType = req.nodeType ?? rng.weighted(NODE_TYPES, [0.3, 0.2, 0.25, 0.25]);
  const profile = req.profile ?? 'gto';
  const board = req.board ?? dealBoard(rng, req.texture);
  if (!board) return null;
  const hero = (nodeType === 'oop-first' || nodeType === 'oop-vs-bet' ? 0 : 1) as 0 | 1;
  const vill = (1 - hero) as 0 | 1;

  const lineSeed = req.lineSeed != null && attempt === 0 ? req.lineSeed : rng.int(2 ** 31);
  const sim = simulateStreets(sc, board, new Rng(lineSeed), vill, profile);
  if (!sim) return null;

  const ids: [number[], number[]] = [[], []];
  for (const p of [0, 1] as const) {
    for (let i = 0; i < NUM_COMBOS; i++) if (sim.ranges[p][i] > SOLVER_MIN_WEIGHT) ids[p].push(i);
  }
  const hands: [HandList, HandList] = [makeHandList(ids[0], board), makeHandList(ids[1], board)];
  const reach: [Float64Array, Float64Array] = [
    Float64Array.from(ids[0], (id) => sim.ranges[0][id]),
    Float64Array.from(ids[1], (id) => sim.ranges[1][id]),
  ];
  const nodes = buildTree({ ...DEFAULT_TREE, pot: sim.pot, stack: sim.stack });
  const solver = new RiverSolver(nodes, sim.pot, hands, reach);
  // Tight target: per-hand EV gaps at deep (rarely reached) nodes converge slower than root exploitability.
  const solved = solver.solve(1200, 0.12);

  const eqStrat = solver.avgStrategy;
  let strat: StrategyFn = eqStrat;
  if (profile !== 'gto') {
    const locked = new Map<number, Float64Array>();
    for (const node of nodes) {
      if (node.type !== NODE_ACTION || node.player !== vill) continue;
      const r = solver.reachAt(node.id, eqStrat);
      const eqV = equityVsRange(hands[vill], hands[hero], r[hero]);
      locked.set(node.id, perturb(profile, node, eqStrat(node.id), percentiles(eqV, r[vill]), sim.pot));
    }
    strat = (id) => locked.get(id) ?? eqStrat(id);
  }

  // Locate the hero's decision.
  const root = nodes[0];
  let heroNode: number;
  let villainActionIdx = -1;
  let villainNodeId = -1;
  if (nodeType === 'oop-first') {
    heroNode = 0;
  } else if (nodeType === 'ip-vs-check') {
    if (actionFreq(solver, strat, 0, 0) < 0.12) return null;
    heroNode = root.children[0];
    villainNodeId = 0;
    villainActionIdx = 0;
  } else {
    const at = nodeType === 'ip-vs-bet' ? 0 : root.children[0];
    if (nodeType === 'oop-vs-bet' && actionFreq(solver, eqStrat, 0, 0) < 0.15) return null;
    const node = nodes[at];
    const cands = node.actions
      .map((a, k) => ({ k, f: a.kind === 'check' ? 0 : actionFreq(solver, strat, at, k) }))
      .filter((c) => c.f >= 0.05);
    if (!cands.length) return null;
    const vf = req.villainFrac;
    const pick =
      vf != null
        ? cands.reduce((best, c) => (Math.abs(node.actions[c.k].frac - vf) < Math.abs(node.actions[best.k].frac - vf) ? c : best))
        : rng.weighted(cands, cands.map((c) => c.f));
    heroNode = node.children[pick.k];
    villainNodeId = at;
    villainActionIdx = pick.k;
  }

  const node: TreeNode = nodes[heroNode];
  const [rOop, rIp] = solver.reachAt(heroNode, strat);
  const rH = hero === 0 ? rOop : rIp;
  const rV = vill === 0 ? rOop : rIp;
  const nA = node.actions.length;
  const nH = hands[hero].n;
  const mode = profile === 'gto' ? 'gto' : 'exploit';

  const vals = solver.actionValues(heroNode, rV, mode === 'gto' ? 'avg' : 'br', strat);
  const mass = solver.oppMass(hero, rV);
  const potAtNode = sim.pot + node.inv[0] + node.inv[1];
  const evFull = new Float64Array(nH * nA);
  for (let i = 0; i < nH; i++) {
    for (let a = 0; a < nA; a++) {
      evFull[i * nA + a] = mass[i] > 1e-9 ? vals[a][i] / mass[i] + solver.halfPot + node.inv[hero] : 0;
    }
  }
  const eqS = eqStrat(heroNode);
  const gtoFull = new Float64Array(nH * nA);
  for (let i = 0; i < nH; i++) for (let a = 0; a < nA; a++) gtoFull[i * nA + a] = eqS[a * nH + i];
  let refFull = gtoFull;
  if (mode === 'exploit') {
    refFull = new Float64Array(nH * nA);
    for (let i = 0; i < nH; i++) {
      let best = -Infinity;
      for (let a = 0; a < nA; a++) best = Math.max(best, evFull[i * nA + a]);
      const tol = 0.0005 * potAtNode;
      let cnt = 0;
      for (let a = 0; a < nA; a++) if (evFull[i * nA + a] >= best - tol) cnt++;
      for (let a = 0; a < nA; a++) refFull[i * nA + a] = evFull[i * nA + a] >= best - tol ? 1 / cnt : 0;
    }
  }

  // Villain's continuing range after each hero action, for value/bluff classification.
  const contFull = new Float64Array(nH * nA).fill(NaN);
  const villainFold: number[] = node.actions.map(() => NaN);
  const villainFoldEq: number[] = node.actions.map(() => NaN);
  node.actions.forEach((a, k) => {
    const child = nodes[node.children[k]];
    if (!(a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin') || child.type !== NODE_ACTION) return;
    const s = strat(child.id);
    const f = child.actions.findIndex((x) => x.kind === 'fold');
    const nV = hands[vill].n;
    const contW = new Float64Array(nV);
    for (let j = 0; j < nV; j++) contW[j] = rV[j] * (1 - s[f * nV + j]);
    const ce = equityVsRange(hands[hero], hands[vill], contW);
    for (let i = 0; i < nH; i++) contFull[i * nA + k] = ce[i];
    villainFold[k] = foldFreq(solver, strat, child.id, rV);
    villainFoldEq[k] = foldFreq(solver, eqStrat, child.id, rV);
  });

  const heroEq = equityVsRange(hands[hero], hands[vill], rV);
  const villEq = equityVsRange(hands[vill], hands[hero], rH);
  const heroView = makeView(hands[hero], rH, heroEq, board);
  const villView = makeView(hands[vill], rV, villEq, board);
  const total = (w: Float32Array) => w.reduce((s, x) => s + x, 0);
  if (heroView.n < 6 || villView.n < 4 || total(heroView.weights) < 5 || total(villView.weights) < 3) return null;

  // Re-index per-hand solver arrays onto the hero view.
  const viewIdx: number[] = [];
  for (let k = 0; k < heroView.n; k++) viewIdx.push(hands[hero].indexOf[heroView.combos[k]]);
  const pick = (src: Float64Array) => {
    const out = new Float32Array(heroView.n * nA);
    viewIdx.forEach((i, k) => {
      for (let a = 0; a < nA; a++) out[k * nA + a] = src[i * nA + a];
    });
    return out;
  };
  const strategy = pick(refFull);
  const gtoStrategy = pick(gtoFull);
  const ev = pick(evFull);
  const contEq = pick(contFull);

  // Skip spots where one action does everything.
  const freqs = new Array(nA).fill(0);
  let wsum = 0;
  for (let k = 0; k < heroView.n; k++) {
    const w = heroView.weights[k];
    wsum += w;
    for (let a = 0; a < nA; a++) freqs[a] += w * strategy[k * nA + a];
  }
  if (freqs.filter((f) => f / wsum >= 0.04).length < 2 && attempt < 25) return null;

  const toCall = node.inv[vill] - node.inv[hero];
  const facing = toCall > 1e-9;
  const potBeforeBet = potAtNode - toCall;
  const actions = node.actions.map((a) => actionOption(a, facing));
  const perAction: (ActionTheory | null)[] = node.actions.map((a) => {
    if (!(a.kind === 'bet' || a.kind === 'raise' || a.kind === 'allin')) return null;
    const X = a.add;
    const C = a.to - node.inv[vill];
    return { bluffShare: C / (potAtNode + X + C), villainMdf: potAtNode / (potAtNode + X), alpha: X / (potAtNode + X) };
  });

  let villainAction: SpotPackage['villainAction'] = { kind: 'none', amount: 0, frac: 0, label: 'Villain has not acted on the river yet' };
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

  const positions: [string, string] = [sc.oopPos, sc.ipPos];
  const riverLines: string[] = [];
  if (nodeType === 'ip-vs-check') riverLines.push(`${positions[vill]} checks`);
  if (nodeType === 'ip-vs-bet') riverLines.push(`${positions[vill]} ${villainAction.kind === 'allin' ? 'moves all-in' : 'bets'} ${r1(villainAction.amount)}bb`);
  if (nodeType === 'oop-vs-bet') riverLines.push(`${positions[hero]} checks`, `${positions[vill]} ${villainAction.kind === 'allin' ? 'moves all-in' : 'bets'} ${r1(villainAction.amount)}bb`);
  const history = sim.history.map((h) => (h.street === 'River' ? { ...h, lines: riverLines } : h));

  // HUD for exploitable villains: how they deviate from equilibrium here.
  let hud: VillainHud | undefined;
  if (mode === 'exploit') {
    const stats: VillainHud['stats'] = [];
    const aggr = node.actions.map((a, k) => ({ a, k })).filter(({ a }) => a.kind !== 'check' && a.kind !== 'fold' && a.kind !== 'call');
    if (aggr.length) {
      const avg = (arr: number[]) => arr.reduce((s, x) => s + x, 0) / arr.length;
      stats.push({
        label: facing ? 'Folds to your raise' : 'Folds to your river bet',
        value: avg(aggr.map(({ k }) => villainFold[k])),
        baseline: avg(aggr.map(({ k }) => villainFoldEq[k])),
      });
    }
    if (villainNodeId >= 0) {
      const vn = nodes[villainNodeId];
      const checkIdx = vn.actions.findIndex((a) => a.kind === 'check');
      const betFreq = (s: StrategyFn) => 1 - actionFreq(solver, s, villainNodeId, checkIdx);
      stats.push({ label: villainNodeId === 0 ? 'Bets when first to act' : 'Bets when checked to', value: betFreq(strat), baseline: betFreq(eqStrat) });
    }
    hud = { stats, notes: [PROFILES[profile].blurb, PROFILES[profile].exploit] };
  }

  let mixed = 0;
  for (let k = 0; k < heroView.n; k++) {
    let mx = 0;
    for (let a = 0; a < nA; a++) mx = Math.max(mx, gtoStrategy[k * nA + a]);
    mixed += heroView.weights[k] * (1 - mx);
  }
  mixed /= wsum;
  const texture = classifyTexture(board);
  const texBonus = texture.id === 'flush-river' || texture.id === 'straight-river' ? 0.08 : texture.id === 'connected' || texture.id === 'flushy' ? 0.04 : 0;
  const difficulty = Math.max(0, Math.min(1, 0.2 + 0.9 * mixed + (facing ? 0.1 : 0) + (hero === 0 ? 0.05 : 0) + (mode === 'exploit' ? 0.1 : 0) + texBonus));

  const spot: SpotPackage = {
    id: `${req.seed.toString(36)}-${attempt}-${lineSeed.toString(36)}-${board.join('.')}${req.suitPerm ? '-' + req.suitPerm.join('') : ''}-${profile}`,
    request: req,
    lineSeed,
    scenario: { id: sc.id, name: sc.name, potType: sc.potType, oopPos: sc.oopPos, ipPos: sc.ipPos },
    board,
    texture,
    history,
    heroSide: hero,
    heroPos: positions[hero],
    villainPos: positions[vill],
    nodeType,
    family: familyKey(nodeType, texture.id),
    profile,
    potStart: sim.pot,
    stackStart: sim.stack,
    pot: potAtNode,
    toCall,
    heroInv: node.inv[hero],
    villainInv: node.inv[vill],
    heroBehind: sim.stack - node.inv[hero],
    villainAction,
    heroPrior: nodeType === 'oop-vs-bet' ? 'You checked' : undefined,
    actions,
    hero: heroView,
    villain: villView,
    theory: {
      pot: potAtNode,
      toCall,
      requiredEquity: facing ? toCall / (potAtNode + toCall) : 0,
      mdf: facing ? potBeforeBet / potAtNode : 0,
      villainBetFrac: facing ? toCall / potBeforeBet : 0,
      villainBluffShare: facing ? toCall / (potAtNode + toCall) : 0,
      perAction,
    },
    solution: { mode, strategy, ev, gtoStrategy, contEq, villainFold, iterations: solved.iterations, solverExplPct: solved.exploitabilityPct },
    hud,
    difficulty,
  };
  if (req.suitPerm) applySuitPerm(spot, req.suitPerm);
  return { spot, ctx: { solver, eqStrat, heroNode, hero, vill, rH, rV, viewIdx, pot: potAtNode } };
}

/** Solver state kept by the worker so a submitted range can be scored against a best response. */
export interface SpotContext {
  solver: RiverSolver;
  eqStrat: StrategyFn;
  heroNode: number;
  hero: 0 | 1;
  vill: 0 | 1;
  rH: Float64Array;
  rV: Float64Array;
  viewIdx: number[];
  pot: number;
}

export function generateSpotWithContext(req: SpotRequest): { spot: SpotPackage; ctx: SpotContext } {
  const rng = new Rng(req.seed);
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = tryGenerate(req, rng, attempt);
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
  const { solver, eqStrat, heroNode, hero, vill, rH, rV, viewIdx } = ctx;
  const node = solver.nodes[heroNode];
  const nA = node.actions.length;
  const nH = solver.hands[hero].n;
  const override = Float64Array.from(eqStrat(heroNode));
  viewIdx.forEach((i, k) => {
    let sum = 0;
    for (let a = 0; a < nA; a++) sum += user[k * nA + a];
    if (sum <= 0) return;
    for (let a = 0; a < nA; a++) override[a * nH + i] = user[k * nA + a] / sum;
  });
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
