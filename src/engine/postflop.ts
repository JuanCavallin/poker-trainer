import { NUM_COMBOS, comboC1, comboC2 } from './combos';
import { evaluateWith } from './evaluator';
import { Rng } from './rng';
import type { Game } from './solver';
import { buildMultiTree, type StreetConfig, type TreeNode } from './tree';

/** A player's hands in a postflop game: every combo alive on the starting board with positive weight. */
export interface Hands {
  n: number;
  combos: Int16Array;
  c1: Uint8Array;
  c2: Uint8Array;
  /** combo id -> index in this list, or -1. */
  indexOf: Int16Array;
}

export function makeHands(ids: ArrayLike<number>): Hands {
  const n = ids.length;
  const combos = new Int16Array(n);
  const c1 = new Uint8Array(n);
  const c2 = new Uint8Array(n);
  const indexOf = new Int16Array(NUM_COMBOS).fill(-1);
  for (let i = 0; i < n; i++) {
    const id = ids[i];
    combos[i] = id;
    c1[i] = comboC1[id];
    c2[i] = comboC2[id];
    indexOf[id] = i;
  }
  return { n, combos, c1, c2, indexOf };
}

interface SortedHands {
  /** Unblocked hand indices sorted by ascending strength. */
  idx: Int32Array;
  str: Int32Array;
  c1: Uint8Array;
  c2: Uint8Array;
}

interface RiverBoard {
  cards: number[];
  /** Per player: unblocked hands sorted by strength, with strengths and cards laid out in that order. */
  sorted: [SortedHands, SortedHands];
}

interface Runout {
  rivers: Int32Array;
  weights: Float64Array;
  /** IP's extra share of the pot (depth-limited showdowns only). */
  edge: number;
}

export interface PostflopGameConfig {
  board: number[];
  pot: number;
  stack: number;
  /** Range weights per combo (1326) for OOP and IP. */
  ranges: [ArrayLike<number>, ArrayLike<number>];
  minWeight?: number;
  streets: Partial<Record<1 | 2 | 3, StreetConfig>>;
  /** Deepest street with betting; later streets are a showdown over sampled runouts. */
  lastStreet: 1 | 2 | 3;
  /** Cards dealt at chance nodes (0 = every card). */
  dealTurn?: number;
  dealRiver?: number;
  /**
   * The next street's card, decided in advance: it is the only card dealt there, and hands holding it
   * are left out (no one can hold a card that is about to be dealt).
   */
  fixedCard?: number;
  /** Runouts used for showdowns before the river (all-ins and depth-limited ends). 0 = every card. */
  leafTurns?: number;
  leafRivers?: number;
  /** Extra pot share for the player in position per street left at a depth-limited showdown. */
  edge?: number;
  seed: number;
}

const STREET_OF_LEN: Record<number, 1 | 2 | 3> = { 3: 1, 4: 2, 5: 3 };

/**
 * Picks `k` of `cards` spread over ranks and suits (systematic over ranks, rotating suits), so a small
 * sample still contains flush cards, pairing cards, overcards and blanks.
 */
export function sampleCards(cards: readonly number[], k: number, rng: Rng): number[] {
  if (k <= 0 || k >= cards.length) return cards.slice();
  const sorted = cards.slice().sort((a, b) => a - b);
  const avail = new Set(sorted);
  const out: number[] = [];
  const u = rng.next();
  const s0 = rng.int(4);
  for (let i = 0; i < k; i++) {
    const pos = Math.min(sorted.length - 1, Math.floor(((i + u) * sorted.length) / k));
    const rank = sorted[pos] >> 2;
    let pick = -1;
    for (let dr = 0; dr < 13 && pick < 0; dr++) {
      for (const r of dr === 0 ? [rank] : [rank + dr, rank - dr]) {
        if (r < 0 || r > 12 || pick >= 0) continue;
        for (let ds = 0; ds < 4; ds++) {
          const c = r * 4 + ((s0 + i + ds) % 4);
          if (avail.has(c)) {
            pick = c;
            break;
          }
        }
      }
    }
    if (pick < 0) break;
    avail.delete(pick);
    out.push(pick);
  }
  return out;
}

export class PostflopGame implements Game {
  readonly nodes: TreeNode[];
  readonly n: [number, number];
  readonly reach: [Float64Array, Float64Array];
  readonly pot: number;
  readonly halfPot: number;
  readonly stack: number;
  readonly hands: [Hands, Hands];
  readonly blocked: [Int32Array[], Int32Array[]];
  readonly board: number[];
  /** Board cards for each context (the root context is 0). */
  readonly ctxCards: number[][] = [];
  private rivers: RiverBoard[] = [];
  private riverIdx = new Map<string, number>();
  private runouts: Runout[] = [];
  private runoutIdx = new Map<string, number>();
  private same: [Int32Array, Int32Array];
  private cs = new Float64Array(52);
  private massBuf: Float64Array;
  private cfg: PostflopGameConfig;
  private rng: Rng;

  constructor(cfg: PostflopGameConfig) {
    this.cfg = cfg;
    this.board = cfg.board.slice();
    this.pot = cfg.pot;
    this.halfPot = cfg.pot / 2;
    this.stack = cfg.stack;
    this.rng = new Rng(cfg.seed);
    const minW = cfg.minWeight ?? 0.004;
    const dead = new Set(cfg.fixedCard != null ? [...cfg.board, cfg.fixedCard] : cfg.board);
    const ids: [number[], number[]] = [[], []];
    for (const p of [0, 1] as const) {
      for (let i = 0; i < NUM_COMBOS; i++) {
        if (cfg.ranges[p][i] > minW && !dead.has(comboC1[i]) && !dead.has(comboC2[i])) ids[p].push(i);
      }
    }
    this.hands = [makeHands(ids[0]), makeHands(ids[1])];
    this.n = [this.hands[0].n, this.hands[1].n];
    this.reach = [Float64Array.from(ids[0], (id) => cfg.ranges[0][id]), Float64Array.from(ids[1], (id) => cfg.ranges[1][id])];
    const mkBlocked = (h: Hands) => {
      const lists: number[][] = Array.from({ length: 52 }, () => []);
      for (let i = 0; i < h.n; i++) {
        lists[h.c1[i]].push(i);
        lists[h.c2[i]].push(i);
      }
      return lists.map((l) => Int32Array.from(l));
    };
    this.blocked = [mkBlocked(this.hands[0]), mkBlocked(this.hands[1])];
    const mkSame = (t: 0 | 1) => Int32Array.from({ length: this.n[t] }, (_, i) => this.hands[1 - t].indexOf[this.hands[t].combos[i]]);
    this.same = [mkSame(0), mkSame(1)];
    this.massBuf = new Float64Array(Math.max(this.n[0], this.n[1], 1));

    this.ctxCards.push(this.board);
    const startStreet = STREET_OF_LEN[this.board.length];
    if (!startStreet) throw new Error('Postflop boards have 3 to 5 cards');
    this.nodes = buildMultiTree(
      { pot: cfg.pot, stack: cfg.stack, startStreet, lastStreet: cfg.lastStreet, streets: cfg.streets },
      {
        deal: (ctx, street) => this.deal(ctx, street),
        showdown: (ctx, street, allin) => this.showdownRunout(ctx, street, allin),
      },
      0,
    );
  }

  private unseen(cards: readonly number[]): number[] {
    const used = new Set(cards);
    const out: number[] = [];
    for (let c = 0; c < 52; c++) if (!used.has(c)) out.push(c);
    return out;
  }

  private deal(ctx: number, street: 2 | 3): { cards: number[]; weights: number[]; ctx: number[] } {
    const base = this.ctxCards[ctx];
    const fixed = this.cfg.fixedCard;
    if (fixed != null && !base.includes(fixed)) {
      this.ctxCards.push([...base, fixed]);
      return { cards: [fixed], weights: [1], ctx: [this.ctxCards.length - 1] };
    }
    const unseen = this.unseen(base);
    const k = street === 2 ? (this.cfg.dealTurn ?? 0) : (this.cfg.dealRiver ?? 0);
    const cards = sampleCards(unseen, k, this.rng);
    const N = unseen.length;
    const w = N / (cards.length * (N - 4));
    const ctxs = cards.map((c) => {
      this.ctxCards.push([...base, c]);
      return this.ctxCards.length - 1;
    });
    return { cards, weights: cards.map(() => w), ctx: ctxs };
  }

  private riverBoard(cards: number[]): number {
    const key = cards.slice().sort((a, b) => a - b).join('.');
    const hit = this.riverIdx.get(key);
    if (hit != null) return hit;
    const dead = new Set(cards);
    const sorted: SortedHands[] = [];
    for (const p of [0, 1] as const) {
      const h = this.hands[p];
      const s = new Int32Array(h.n);
      const live: number[] = [];
      for (let i = 0; i < h.n; i++) {
        if (dead.has(h.c1[i]) || dead.has(h.c2[i])) continue;
        s[i] = evaluateWith(cards, h.c1[i], h.c2[i]);
        live.push(i);
      }
      live.sort((a, b) => s[a] - s[b]);
      sorted.push({
        idx: Int32Array.from(live),
        str: Int32Array.from(live, (i) => s[i]),
        c1: Uint8Array.from(live, (i) => h.c1[i]),
        c2: Uint8Array.from(live, (i) => h.c2[i]),
      });
    }
    this.rivers.push({ cards, sorted: [sorted[0], sorted[1]] });
    this.riverIdx.set(key, this.rivers.length - 1);
    return this.rivers.length - 1;
  }

  /** Builds a runout set completing `cards` to five cards. `turns`/`rivers` = samples per level (0 = all). */
  makeRunout(cards: readonly number[], turns: number, rivers: number, edge: number): number {
    const boards: number[] = [];
    const weights: number[] = [];
    if (cards.length === 5) {
      boards.push(this.riverBoard(cards.slice()));
      weights.push(1);
    } else if (cards.length === 4) {
      const unseen = this.unseen(cards);
      const pick = sampleCards(unseen, rivers, this.rng);
      const N = unseen.length;
      for (const r of pick) {
        boards.push(this.riverBoard([...cards, r]));
        weights.push(N / (pick.length * (N - 4)));
      }
    } else {
      const unseen = this.unseen(cards);
      const N = unseen.length;
      const pairs: [number, number][] = [];
      for (const t of sampleCards(unseen, turns, this.rng)) {
        for (const r of sampleCards(unseen.filter((c) => c !== t), rivers, this.rng)) pairs.push([t, r]);
      }
      const w = (N * (N - 1)) / (pairs.length * (N - 4) * (N - 5));
      for (const [t, r] of pairs) {
        boards.push(this.riverBoard([...cards, t, r]));
        weights.push(w);
      }
    }
    this.runouts.push({ rivers: Int32Array.from(boards), weights: Float64Array.from(weights), edge });
    return this.runouts.length - 1;
  }

  private showdownRunout(ctx: number, street: 1 | 2 | 3, allin: boolean): number {
    const key = `${ctx}|${allin ? 1 : 0}`;
    const hit = this.runoutIdx.get(key);
    if (hit != null) return hit;
    const cards = this.ctxCards[ctx];
    const edge = allin || cards.length === 5 ? 0 : (this.cfg.edge ?? 0) * (3 - street);
    const idx = this.makeRunout(cards, this.cfg.leafTurns ?? 8, this.cfg.leafRivers ?? 6, edge);
    this.runoutIdx.set(key, idx);
    return idx;
  }

  oppMass(t: number, reachOpp: ArrayLike<number>, out: Float64Array = new Float64Array(this.n[t])): Float64Array {
    const ht = this.hands[t];
    const ho = this.hands[1 - t];
    const cs = this.cs;
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

  /** Adds scale * (opponent mass beaten - opponent mass that beats us) on one river board. */
  private sweep(rb: RiverBoard, t: number, reachOpp: ArrayLike<number>, out: Float64Array, scale: number): void {
    const T = rb.sorted[t];
    const O = rb.sorted[1 - t];
    const ti = T.idx;
    const ts = T.str;
    const t1 = T.c1;
    const t2 = T.c2;
    const oi = O.idx;
    const os = O.str;
    const o1 = O.c1;
    const o2 = O.c2;
    const nT = ti.length;
    const nO = oi.length;
    const cs = this.cs;
    cs.fill(0);
    let tot = 0;
    let j = 0;
    for (let k = 0; k < nT; k++) {
      const s = ts[k];
      while (j < nO && os[j] < s) {
        const x = reachOpp[oi[j]];
        tot += x;
        cs[o1[j]] += x;
        cs[o2[j]] += x;
        j++;
      }
      out[ti[k]] += scale * (tot - cs[t1[k]] - cs[t2[k]]);
    }
    cs.fill(0);
    tot = 0;
    j = nO - 1;
    for (let k = nT - 1; k >= 0; k--) {
      const s = ts[k];
      while (j >= 0 && os[j] > s) {
        const x = reachOpp[oi[j]];
        tot += x;
        cs[o1[j]] += x;
        cs[o2[j]] += x;
        j--;
      }
      out[ti[k]] -= scale * (tot - cs[t1[k]] - cs[t2[k]]);
    }
  }

  showdownValue(node: TreeNode, t: number, reachOpp: ArrayLike<number>, out: Float64Array): void {
    const ro = this.runouts[node.runout];
    out.fill(0, 0, this.n[t]);
    const win = this.halfPot + node.inv[0];
    for (let k = 0; k < ro.rivers.length; k++) this.sweep(this.rivers[ro.rivers[k]], t, reachOpp, out, ro.weights[k] * win);
    if (ro.edge > 0) {
      const mass = this.oppMass(t, reachOpp, this.massBuf);
      const e = (t === 1 ? 1 : -1) * ro.edge * (this.pot + node.inv[0] + node.inv[1]);
      for (let i = 0; i < this.n[t]; i++) out[i] += e * mass[i];
    }
  }

  /**
   * All-in equity of t's hands against a weighted opponent range on `cards` (3-5 cards), averaged over
   * runouts. NaN for hands with no compatible opponent combos or blocked by the board.
   */
  equity(t: number, reachOpp: ArrayLike<number>, cards: readonly number[], turns = 12, rivers = 8): Float64Array {
    const ro = this.runouts[this.makeRunout(cards, turns, rivers, 0)];
    const nT = this.n[t];
    const v = new Float64Array(nT);
    for (let k = 0; k < ro.rivers.length; k++) this.sweep(this.rivers[ro.rivers[k]], t, reachOpp, v, ro.weights[k]);
    const mass = this.oppMass(t, reachOpp);
    const dead = new Set(cards);
    const h = this.hands[t];
    const out = new Float64Array(nT);
    for (let i = 0; i < nT; i++) {
      if (mass[i] <= 1e-9 || dead.has(h.c1[i]) || dead.has(h.c2[i])) out[i] = NaN;
      else out[i] = Math.min(1, Math.max(0, 0.5 * (1 + v[i] / mass[i])));
    }
    return out;
  }

  /** Context id of the node's board (root context for nodes on the starting street). */
  cardsAt(node: TreeNode): number[] {
    return this.ctxCards[node.ctx];
  }
}
