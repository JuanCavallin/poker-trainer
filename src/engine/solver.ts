import { NODE_ACTION, NODE_CHANCE, NODE_FOLD, pathTo, type TreeNode } from './tree';

/** Strategy lookup used by evaluation traversals: nA x nPlayerHands, row-major by action. */
export type StrategyFn = (nodeId: number) => Float64Array;

/**
 * A two-player zero-sum game over a public tree. Values are zero-sum: each player "owns" half the
 * root pot, so folding costs the folder half the pot plus what they put in.
 */
export interface Game {
  nodes: TreeNode[];
  /** Number of hands (information sets per public node) for each player. */
  n: [number, number];
  /** Initial range weights. */
  reach: [Float64Array, Float64Array];
  pot: number;
  halfPot: number;
  /** Chance nodes: hand indices of each player that contain each card (those hands can't see that card). */
  blocked?: [Int32Array[], Int32Array[]];
  /** Opponent mass compatible with each of t's hands (card removal). */
  oppMass(t: number, reachOpp: ArrayLike<number>, out: Float64Array): Float64Array;
  /** Counterfactual showdown values for t's hands at a showdown node. */
  showdownValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void;
}

export interface SolveOptions {
  maxIter?: number;
  /** Stop once exploitability (% of pot) is below this. */
  targetPct?: number;
  /** How often to measure exploitability. */
  checkEvery?: number;
  /** Stop after this many milliseconds (checked between iterations). */
  timeBudgetMs?: number;
  onProgress?: (iter: number, explPct: number) => void;
}

interface Scratch {
  cr: Float64Array[];
  cv: Float64Array[];
  ms: Float64Array;
  mo: Float64Array;
}

const sumOf = (a: ArrayLike<number>, n: number): number => {
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i];
  return s;
};

/** Vectorised Discounted CFR (alpha 1.5, beta 0, gamma 2) with alternating updates. */
export class Solver {
  readonly game: Game;
  readonly nodes: TreeNode[];
  readonly pot: number;
  readonly halfPot: number;
  readonly reach: [Float64Array, Float64Array];
  iterations = 0;

  private regret: (Float32Array | null)[];
  private stratSum: (Float32Array | null)[];
  /** Current strategy (regret matching), refreshed whenever a node's regrets change. */
  private sigma: (Float32Array | null)[];
  private scratch: Scratch[] = [];
  private maxA = 1;
  private maxN: number;
  private avgCache = new Map<number, Float64Array>();
  private pos = 0;
  private neg = 0.5;
  private gam = 0;

  constructor(game: Game) {
    this.game = game;
    this.nodes = game.nodes;
    this.pot = game.pot;
    this.halfPot = game.halfPot;
    this.reach = game.reach;
    this.maxN = Math.max(game.n[0], game.n[1], 1);
    this.regret = game.nodes.map(() => null);
    this.stratSum = game.nodes.map(() => null);
    this.sigma = game.nodes.map(() => null);
    for (const node of game.nodes) {
      if (node.type !== NODE_ACTION) continue;
      const size = node.actions.length * game.n[node.player];
      this.regret[node.id] = new Float32Array(size);
      this.stratSum[node.id] = new Float32Array(size);
      this.sigma[node.id] = new Float32Array(size).fill(1 / node.actions.length);
      this.maxA = Math.max(this.maxA, node.actions.length);
    }
  }

  oppMass(t: number, reachOpp: ArrayLike<number>, out: Float64Array = new Float64Array(this.game.n[t])): Float64Array {
    return this.game.oppMass(t, reachOpp, out);
  }

  private buf(depth: number): Scratch {
    while (this.scratch.length <= depth) {
      const N = this.maxN;
      this.scratch.push({
        cr: Array.from({ length: this.maxA }, () => new Float64Array(N)),
        cv: Array.from({ length: this.maxA }, () => new Float64Array(N)),
        ms: new Float64Array(N),
        mo: new Float64Array(N),
      });
    }
    return this.scratch[depth];
  }

  private regretMatch(nodeId: number, nA: number, nP: number): void {
    const R = this.regret[nodeId]!;
    const S = this.sigma[nodeId]!;
    for (let i = 0; i < nP; i++) {
      let sum = 0;
      for (let a = 0; a < nA; a++) {
        const r = R[a * nP + i];
        if (r > 0) sum += r;
      }
      if (sum > 0) {
        const inv = 1 / sum;
        for (let a = 0; a < nA; a++) {
          const r = R[a * nP + i];
          S[a * nP + i] = r > 0 ? r * inv : 0;
        }
      } else {
        const u = 1 / nA;
        for (let a = 0; a < nA; a++) S[a * nP + i] = u;
      }
    }
  }

  private foldValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void {
    const payoff = node.player === t ? -(this.halfPot + node.inv[t]) : this.halfPot + node.inv[1 - t];
    this.game.oppMass(t, reachOpp, out);
    const n = this.game.n[t];
    for (let i = 0; i < n; i++) out[i] *= payoff;
  }

  private cfr(nodeId: number, t: number, rs: Float64Array, ro: Float64Array, out: Float64Array, depth: number): void {
    const node = this.nodes[nodeId];
    const nT = this.game.n[t];
    if (node.type === NODE_FOLD) {
      this.foldValue(node, t, ro, out);
      return;
    }
    if (node.type === NODE_ACTION) {
      const p = node.player;
      const nA = node.actions.length;
      const nP = this.game.n[p];
      const sc = this.buf(depth);
      const sig = this.sigma[nodeId]!;
      if (p === t) {
        for (let a = 0; a < nA; a++) {
          const r = sc.cr[a];
          const base = a * nP;
          for (let i = 0; i < nP; i++) r[i] = rs[i] * sig[base + i];
          this.cfr(node.children[a], t, r, ro, sc.cv[a], depth + 1);
        }
        out.fill(0, 0, nT);
        for (let a = 0; a < nA; a++) {
          const va = sc.cv[a];
          const base = a * nP;
          for (let i = 0; i < nP; i++) out[i] += sig[base + i] * va[i];
        }
        const R = this.regret[nodeId]!;
        const SS = this.stratSum[nodeId]!;
        const pos = this.pos;
        const neg = this.neg;
        const g = this.gam;
        for (let a = 0; a < nA; a++) {
          const va = sc.cv[a];
          const base = a * nP;
          for (let i = 0; i < nP; i++) {
            const k = base + i;
            const r = R[k];
            R[k] = (r > 0 ? r * pos : r * neg) + va[i] - out[i];
            SS[k] = SS[k] * g + rs[i] * sig[k];
          }
        }
        this.regretMatch(nodeId, nA, nP);
      } else {
        out.fill(0, 0, nT);
        const tmp = sc.cv[0];
        const r = sc.cr[0];
        for (let a = 0; a < nA; a++) {
          const base = a * nP;
          let mass = 0;
          for (let i = 0; i < nP; i++) {
            const x = ro[i] * sig[base + i];
            r[i] = x;
            mass += x;
          }
          if (mass <= 0) continue;
          this.cfr(node.children[a], t, rs, r, tmp, depth + 1);
          for (let i = 0; i < nT; i++) out[i] += tmp[i];
        }
      }
      return;
    }
    if (node.type === NODE_CHANCE) {
      this.chance(node, t, rs, ro, out, depth, (child, rsC, roC, val) => this.cfr(child, t, rsC, roC, val, depth + 1));
      return;
    }
    this.game.showdownValue(node, t, ro, out);
  }

  /** Shared chance-node logic: masks blocked hands per card and sums weighted child values. */
  private chance(
    node: TreeNode,
    t: number,
    rs: ArrayLike<number>,
    ro: ArrayLike<number>,
    out: Float64Array,
    depth: number,
    visit: (child: number, rs: Float64Array, ro: Float64Array, val: Float64Array) => void,
  ): void {
    const blocked = this.game.blocked!;
    const nT = this.game.n[t];
    const nO = this.game.n[1 - t];
    const sc = this.buf(depth);
    const ms = sc.ms;
    const mo = sc.mo;
    const val = sc.cv[0];
    out.fill(0, 0, nT);
    const cards = node.cards!;
    const weights = node.weights!;
    for (let k = 0; k < cards.length; k++) {
      const c = cards[k];
      for (let i = 0; i < nT; i++) ms[i] = rs[i];
      for (let i = 0; i < nO; i++) mo[i] = ro[i];
      const bt = blocked[t][c];
      const bo = blocked[1 - t][c];
      for (let j = 0; j < bt.length; j++) ms[bt[j]] = 0;
      for (let j = 0; j < bo.length; j++) mo[bo[j]] = 0;
      if (sumOf(mo, nO) <= 0) continue;
      visit(node.children[k], ms, mo, val);
      for (let j = 0; j < bt.length; j++) val[bt[j]] = 0;
      const w = weights[k];
      for (let i = 0; i < nT; i++) out[i] += w * val[i];
    }
  }

  /** Runs DCFR until exploitability drops below `targetPct` percent of the pot. */
  solve(opts: SolveOptions = {}): { iterations: number; exploitabilityPct: number } {
    const maxIter = opts.maxIter ?? 800;
    const target = opts.targetPct ?? 0.25;
    const every = opts.checkEvery ?? 50;
    const t0 = Date.now();
    let expl = Infinity;
    const root = new Float64Array(this.maxN);
    for (let T = 1; T <= maxIter; T++) {
      const ta = Math.pow(Math.max(0, T - 1), 1.5);
      this.pos = ta / (ta + 1);
      this.gam = Math.pow((T - 1) / T, 2);
      for (let t = 0; t < 2; t++) this.cfr(0, t, this.reach[t], this.reach[1 - t], root, 0);
      this.iterations = T;
      const timeUp = opts.timeBudgetMs != null && Date.now() - t0 > opts.timeBudgetMs;
      if (T % every === 0 || T === maxIter || timeUp) {
        this.avgCache.clear();
        expl = this.exploitabilityPct();
        opts.onProgress?.(T, expl);
        if (expl < target || timeUp) break;
      }
    }
    this.avgCache.clear();
    return { iterations: this.iterations, exploitabilityPct: expl };
  }

  // ---------------------------------------------------------------- strategies & evaluation

  /** Normalised average strategy at an action node (nA x nP). */
  avgStrategy = (nodeId: number): Float64Array => {
    const cached = this.avgCache.get(nodeId);
    if (cached) return cached;
    const node = this.nodes[nodeId];
    const nA = node.actions.length;
    const nP = this.game.n[node.player];
    const SS = this.stratSum[nodeId]!;
    const out = new Float64Array(nA * nP);
    for (let i = 0; i < nP; i++) {
      let sum = 0;
      for (let a = 0; a < nA; a++) sum += SS[a * nP + i];
      for (let a = 0; a < nA; a++) out[a * nP + i] = sum > 0 ? SS[a * nP + i] / sum : 1 / nA;
    }
    this.avgCache.set(nodeId, out);
    return out;
  };

  /**
   * Counterfactual values for player t's hands at `nodeId`, given the opponent's reach there.
   * t plays `tMode` ('avg' follows `strat`, 'br' best-responds); the opponent always follows `strat`.
   */
  evaluate(nodeId: number, t: number, reachOpp: ArrayLike<number>, tMode: 'avg' | 'br', strat: StrategyFn): Float64Array {
    const node = this.nodes[nodeId];
    const nT = this.game.n[t];
    const out = new Float64Array(nT);
    if (node.type === NODE_FOLD) {
      this.foldValue(node, t, reachOpp, out);
      return out;
    }
    if (node.type === NODE_CHANCE) {
      const blocked = this.game.blocked!;
      const nO = this.game.n[1 - t];
      node.cards!.forEach((c, k) => {
        const mo = Float64Array.from({ length: nO }, (_, i) => reachOpp[i]);
        for (const j of blocked[1 - t][c]) mo[j] = 0;
        if (sumOf(mo, nO) <= 0) return;
        const v = this.evaluate(node.children[k], t, mo, tMode, strat);
        for (const j of blocked[t][c]) v[j] = 0;
        const w = node.weights![k];
        for (let i = 0; i < nT; i++) out[i] += w * v[i];
      });
      return out;
    }
    if (node.type !== NODE_ACTION) {
      this.game.showdownValue(node, t, reachOpp, out);
      return out;
    }
    const p = node.player;
    const nA = node.actions.length;
    const nP = this.game.n[p];
    const s = strat(nodeId);
    if (p === t) {
      if (tMode === 'br') out.fill(-Infinity);
      for (let a = 0; a < nA; a++) {
        const va = this.evaluate(node.children[a], t, reachOpp, tMode, strat);
        if (tMode === 'br') {
          for (let i = 0; i < nT; i++) if (va[i] > out[i]) out[i] = va[i];
        } else {
          for (let i = 0; i < nT; i++) out[i] += s[a * nP + i] * va[i];
        }
      }
    } else {
      const r = new Float64Array(nP);
      for (let a = 0; a < nA; a++) {
        let mass = 0;
        for (let i = 0; i < nP; i++) {
          r[i] = reachOpp[i] * s[a * nP + i];
          mass += r[i];
        }
        if (mass <= 0) continue;
        const va = this.evaluate(node.children[a], t, r, tMode, strat);
        for (let i = 0; i < nT; i++) out[i] += va[i];
      }
    }
    return out;
  }

  /** Per-action counterfactual values for the acting player at an action node. */
  actionValues(nodeId: number, reachOpp: ArrayLike<number>, tMode: 'avg' | 'br', strat: StrategyFn): Float64Array[] {
    const node = this.nodes[nodeId];
    return node.children.map((c) => this.evaluate(c, node.player, reachOpp, tMode, strat));
  }

  /**
   * Both players' reach at `nodeId` under `strat`. Cards dealt on the way zero the hands that hold them,
   * so this is each player's range at the node. `cardsAt` overrides which card a chance node deals.
   */
  reachAt(nodeId: number, strat: StrategyFn): [Float64Array, Float64Array] {
    const r: [Float64Array, Float64Array] = [Float64Array.from(this.reach[0]), Float64Array.from(this.reach[1])];
    for (const step of pathTo(this.nodes, nodeId)) {
      const node = this.nodes[step.node];
      if (node.type === NODE_CHANCE) {
        const c = node.cards![step.action];
        for (const p of [0, 1]) for (const j of this.game.blocked![p][c]) r[p][j] = 0;
        continue;
      }
      const p = node.player;
      const nP = this.game.n[p];
      const s = strat(step.node);
      const base = step.action * nP;
      for (let i = 0; i < nP; i++) r[p][i] *= s[base + i];
    }
    return r;
  }

  /** Average exploitability of the current average strategies, in chips per hand. */
  exploitability(strat: StrategyFn = this.avgStrategy): number {
    const v0 = this.evaluate(0, 0, this.reach[1], 'br', strat);
    const v1 = this.evaluate(0, 1, this.reach[0], 'br', strat);
    let b0 = 0;
    let b1 = 0;
    for (let i = 0; i < v0.length; i++) b0 += this.reach[0][i] * v0[i];
    for (let i = 0; i < v1.length; i++) b1 += this.reach[1][i] * v1[i];
    const mass = this.oppMass(0, this.reach[1]);
    let z = 0;
    for (let i = 0; i < mass.length; i++) z += this.reach[0][i] * mass[i];
    return z > 0 ? (b0 + b1) / (2 * z) : 0;
  }

  exploitabilityPct(): number {
    return (100 * this.exploitability()) / this.pot;
  }
}
