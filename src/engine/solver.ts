import type { HandList } from './equity';
import { NODE_ACTION, NODE_FOLD, NODE_SHOWDOWN, pathTo, type TreeNode } from './tree';

/** Strategy lookup used by evaluation traversals: nA x nPlayerHands, row-major by action. */
export type StrategyFn = (nodeId: number) => Float64Array;

/**
 * Vectorised Discounted CFR (alpha 1.5, beta 0, gamma 2) over a heads-up river tree.
 * Values are zero-sum: each player "owns" half the starting pot, so a showdown win is
 * worth +(pot/2 + opponent's river investment).
 */
export class RiverSolver {
  readonly nodes: TreeNode[];
  readonly pot: number;
  readonly halfPot: number;
  readonly hands: [HandList, HandList];
  readonly reach: [Float64Array, Float64Array];
  iterations = 0;

  private regret: (Float64Array | null)[];
  private stratSum: (Float64Array | null)[];
  private sigma: (Float64Array | null)[];
  private childReach: (Float64Array[] | null)[];
  private val: [Float64Array[], Float64Array[]];
  /** same[t][i] = index of the identical combo in the opponent's list, or -1. */
  private same: [Int32Array, Int32Array];
  private cardSum = new Float64Array(52);
  private avgCache = new Map<number, Float64Array>();

  constructor(nodes: TreeNode[], pot: number, hands: [HandList, HandList], reach: [Float64Array, Float64Array]) {
    this.nodes = nodes;
    this.pot = pot;
    this.halfPot = pot / 2;
    this.hands = hands;
    this.reach = reach;
    this.regret = nodes.map(() => null);
    this.stratSum = nodes.map(() => null);
    this.sigma = nodes.map(() => null);
    this.childReach = nodes.map(() => null);
    this.val = [nodes.map(() => new Float64Array(hands[0].n)), nodes.map(() => new Float64Array(hands[1].n))];
    for (const node of nodes) {
      if (node.type !== NODE_ACTION) continue;
      const size = node.actions.length * hands[node.player].n;
      this.regret[node.id] = new Float64Array(size);
      this.stratSum[node.id] = new Float64Array(size);
      this.sigma[node.id] = new Float64Array(size);
      this.childReach[node.id] = node.actions.map(() => new Float64Array(hands[node.player].n));
    }
    const mk = (t: 0 | 1) => {
      const h = hands[t];
      const o = hands[1 - t];
      const arr = new Int32Array(h.n);
      for (let i = 0; i < h.n; i++) arr[i] = o.indexOf[h.combos[i]];
      return arr;
    };
    this.same = [mk(0), mk(1)];
  }

  // ---------------------------------------------------------------- terminals

  /** Compatible opponent mass for each of t's hands. */
  oppMass(t: number, reachOpp: ArrayLike<number>, out: Float64Array = new Float64Array(this.hands[t].n)): Float64Array {
    const ht = this.hands[t];
    const ho = this.hands[1 - t];
    const cs = this.cardSum;
    cs.fill(0);
    let tot = 0;
    for (let j = 0; j < ho.n; j++) {
      const x = reachOpp[j];
      if (x === 0) continue;
      tot += x;
      cs[ho.c1[j]] += x;
      cs[ho.c2[j]] += x;
    }
    const same = this.same[t];
    for (let i = 0; i < ht.n; i++) {
      const s = same[i];
      out[i] = tot - cs[ht.c1[i]] - cs[ht.c2[i]] + (s >= 0 ? reachOpp[s] : 0);
    }
    return out;
  }

  private foldValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void {
    const payoff = node.player === t ? -(this.halfPot + node.inv[t]) : this.halfPot + node.inv[1 - t];
    this.oppMass(t, reachOpp, out);
    for (let i = 0; i < out.length; i++) out[i] *= payoff;
  }

  private showdownValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void {
    const win = this.halfPot + node.inv[0];
    const ht = this.hands[t];
    const ho = this.hands[1 - t];
    const cs = this.cardSum;
    const st = ht.strength;
    const so = ho.strength;
    const ot = ht.order;
    const oo = ho.order;
    cs.fill(0);
    let tot = 0;
    let j = 0;
    for (let k = 0; k < ht.n; k++) {
      const i = ot[k];
      const s = st[i];
      while (j < ho.n && so[oo[j]] < s) {
        const h = oo[j++];
        const x = reachOpp[h];
        tot += x;
        cs[ho.c1[h]] += x;
        cs[ho.c2[h]] += x;
      }
      out[i] = win * (tot - cs[ht.c1[i]] - cs[ht.c2[i]]);
    }
    cs.fill(0);
    tot = 0;
    j = ho.n - 1;
    for (let k = ht.n - 1; k >= 0; k--) {
      const i = ot[k];
      const s = st[i];
      while (j >= 0 && so[oo[j]] > s) {
        const h = oo[j--];
        const x = reachOpp[h];
        tot += x;
        cs[ho.c1[h]] += x;
        cs[ho.c2[h]] += x;
      }
      out[i] -= win * (tot - cs[ht.c1[i]] - cs[ht.c2[i]]);
    }
  }

  // ---------------------------------------------------------------- CFR

  private regretMatch(nodeId: number, nA: number, nP: number): Float64Array {
    const R = this.regret[nodeId]!;
    const S = this.sigma[nodeId]!;
    for (let i = 0; i < nP; i++) {
      let sum = 0;
      for (let a = 0; a < nA; a++) {
        const r = R[a * nP + i];
        if (r > 0) sum += r;
      }
      if (sum > 0) {
        for (let a = 0; a < nA; a++) {
          const r = R[a * nP + i];
          S[a * nP + i] = r > 0 ? r / sum : 0;
        }
      } else {
        const u = 1 / nA;
        for (let a = 0; a < nA; a++) S[a * nP + i] = u;
      }
    }
    return S;
  }

  private cfr(nodeId: number, t: number, reachSelf: Float64Array, reachOpp: Float64Array): Float64Array {
    const node = this.nodes[nodeId];
    const out = this.val[t][nodeId];
    if (node.type === NODE_FOLD) {
      this.foldValue(node, t, reachOpp, out);
      return out;
    }
    if (node.type === NODE_SHOWDOWN) {
      this.showdownValue(node, t, reachOpp, out);
      return out;
    }
    const p = node.player;
    const nA = node.actions.length;
    const nP = this.hands[p].n;
    const sig = this.regretMatch(nodeId, nA, nP);
    const cr = this.childReach[nodeId]!;
    out.fill(0);
    if (p === t) {
      for (let a = 0; a < nA; a++) {
        const r = cr[a];
        const base = a * nP;
        for (let i = 0; i < nP; i++) r[i] = reachSelf[i] * sig[base + i];
        const va = this.cfr(node.children[a], t, r, reachOpp);
        for (let i = 0; i < nP; i++) out[i] += sig[base + i] * va[i];
      }
      const R = this.regret[nodeId]!;
      const SS = this.stratSum[nodeId]!;
      for (let a = 0; a < nA; a++) {
        const va = this.val[t][node.children[a]];
        const base = a * nP;
        for (let i = 0; i < nP; i++) {
          R[base + i] += va[i] - out[i];
          SS[base + i] += reachSelf[i] * sig[base + i];
        }
      }
    } else {
      const nT = this.hands[t].n;
      for (let a = 0; a < nA; a++) {
        const r = cr[a];
        const base = a * nP;
        for (let i = 0; i < nP; i++) r[i] = reachOpp[i] * sig[base + i];
        const va = this.cfr(node.children[a], t, reachSelf, r);
        for (let i = 0; i < nT; i++) out[i] += va[i];
      }
    }
    return out;
  }

  private discount(t: number, T: number): void {
    const ta = Math.pow(Math.max(0, T - 1), 1.5);
    const pos = ta / (ta + 1);
    const neg = 0.5;
    const g = Math.pow((T - 1) / T, 2);
    for (const node of this.nodes) {
      if (node.type !== NODE_ACTION || node.player !== t) continue;
      const R = this.regret[node.id]!;
      const SS = this.stratSum[node.id]!;
      for (let k = 0; k < R.length; k++) {
        R[k] *= R[k] > 0 ? pos : neg;
        SS[k] *= g;
      }
    }
  }

  /** Runs DCFR until exploitability drops below `targetPct` percent of the pot (checked every 50 iterations). */
  solve(maxIter = 800, targetPct = 0.25): { iterations: number; exploitabilityPct: number } {
    let expl = Infinity;
    for (let T = 1; T <= maxIter; T++) {
      for (let t = 0; t < 2; t++) {
        this.discount(t, T);
        this.cfr(0, t, this.reach[t], this.reach[1 - t]);
      }
      this.iterations = T;
      if (T % 50 === 0 || T === maxIter) {
        this.avgCache.clear();
        expl = this.exploitabilityPct();
        if (expl < targetPct) break;
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
    const nP = this.hands[node.player].n;
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
    const nT = this.hands[t].n;
    const out = new Float64Array(nT);
    if (node.type === NODE_FOLD) {
      this.foldValue(node, t, reachOpp, out);
      return out;
    }
    if (node.type === NODE_SHOWDOWN) {
      this.showdownValue(node, t, reachOpp, out);
      return out;
    }
    const p = node.player;
    const nA = node.actions.length;
    const nP = this.hands[p].n;
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
        for (let i = 0; i < nP; i++) r[i] = reachOpp[i] * s[a * nP + i];
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

  /** Both players' reach probabilities at `nodeId` under `strat`. */
  reachAt(nodeId: number, strat: StrategyFn): [Float64Array, Float64Array] {
    const r: [Float64Array, Float64Array] = [Float64Array.from(this.reach[0]), Float64Array.from(this.reach[1])];
    for (const step of pathTo(this.nodes, nodeId)) {
      const node = this.nodes[step.node];
      const p = node.player;
      const nP = this.hands[p].n;
      const s = strat(step.node);
      const base = step.action * nP;
      for (let i = 0; i < nP; i++) r[p][i] *= s[base + i];
    }
    return r;
  }

  /** Average exploitability of the current average strategies, in chips per hand. */
  exploitability(): number {
    const v0 = this.evaluate(0, 0, this.reach[1], 'br', this.avgStrategy);
    const v1 = this.evaluate(0, 1, this.reach[0], 'br', this.avgStrategy);
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
