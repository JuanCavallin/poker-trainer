/**
 * Heads-up betting trees. Player 0 = OOP (acts first after the flop), 1 = IP.
 * Investments are cumulative from the root of the (sub)game; `pot` is the pot at the root.
 */
export type ActionKind = 'check' | 'bet' | 'call' | 'fold' | 'raise' | 'allin';

export interface TreeAction {
  kind: ActionKind;
  /** Actor's total investment after the action. */
  to: number;
  /** Chips added by this action. */
  add: number;
  /** For bets/raises: chips added divided by the pot before the action. */
  frac: number;
}

export const NODE_ACTION = 0;
export const NODE_FOLD = 1;
export const NODE_SHOWDOWN = 2;
/** A card is dealt (turn or river); children are indexed like `cards`. */
export const NODE_CHANCE = 3;

/** 0 = preflop, 1 = flop, 2 = turn, 3 = river. */
export type StreetIndex = 0 | 1 | 2 | 3;

export interface TreeNode {
  id: number;
  type: 0 | 1 | 2 | 3;
  /** Acting player (action nodes) or the folder (fold nodes); -1 otherwise. */
  player: number;
  inv: [number, number];
  actions: TreeAction[];
  children: number[];
  parent: number;
  parentAction: number;
  raises: number;
  street: StreetIndex;
  /** Board context (game-defined) the node is played on. */
  ctx: number;
  /** Showdown nodes: game-defined runout/terminal index. */
  runout: number;
  /** Chance nodes: the card dealt to reach each child, and its chance weight. */
  cards?: number[];
  weights?: number[];
}

export interface StreetConfig {
  oopBets: number[];
  ipBets: number[];
  /** Raise to this multiple of the bet being faced (measured from the start of the street). */
  raiseMult: number;
  maxRaises: number;
  /** A bet or raise that would commit at least this share of the remaining stack goes all-in instead. */
  allinFrac: number;
  /** Offer an explicit all-in in addition to the sized bets/raises. */
  allowAllin: boolean;
  /** Only offer the explicit all-in when the remaining stack is at most this many pots. */
  allinMaxSpr?: number;
}

export interface TreeConfig extends StreetConfig {
  pot: number;
  stack: number;
}

export const DEFAULT_TREE: StreetConfig = {
  oopBets: [0.33, 0.75],
  ipBets: [0.33, 0.75],
  raiseMult: 3,
  maxRaises: 1,
  allinFrac: 0.7,
  allowAllin: true,
};

export interface MultiTreeConfig {
  pot: number;
  stack: number;
  startStreet: 1 | 2 | 3;
  /** Deepest street with betting. When it closes before the river, the hand goes to a depth-limited showdown. */
  lastStreet: 1 | 2 | 3;
  streets: Partial<Record<1 | 2 | 3, StreetConfig>>;
}

export interface TreeHooks {
  /** Deals the next street from board context `ctx`. */
  deal(ctx: number, street: 2 | 3): { cards: number[]; weights: number[]; ctx: number[] };
  /** Terminal index for a showdown on `ctx` once betting on `street` closes (`allin`: no more betting possible). */
  showdown(ctx: number, street: 1 | 2 | 3, allin: boolean): number;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

export function buildMultiTree(cfg: MultiTreeConfig, hooks: TreeHooks, rootCtx: number): TreeNode[] {
  const nodes: TreeNode[] = [];
  const add = (n: Omit<TreeNode, 'id'>): number => {
    const id = nodes.length;
    nodes.push({ ...n, id });
    return id;
  };
  const leaf = (type: 1 | 2, player: number, inv: [number, number], parent: number, parentAction: number, street: StreetIndex, ctx: number, runout: number) =>
    add({ type, player, inv, actions: [], children: [], parent, parentAction, raises: 0, street, ctx, runout });

  /** Betting on `street` has closed with equal investments. */
  function closeStreet(street: 1 | 2 | 3, inv: [number, number], parent: number, parentAction: number, ctx: number): number {
    const allin = inv[0] >= cfg.stack - 1e-9;
    if (street === 3 || allin || street === cfg.lastStreet) {
      return leaf(NODE_SHOWDOWN, -1, [inv[0], inv[1]], parent, parentAction, street, ctx, hooks.showdown(ctx, street, allin));
    }
    const next = (street + 1) as 2 | 3;
    const deal = hooks.deal(ctx, next);
    const id = add({ type: NODE_CHANCE, player: -1, inv: [inv[0], inv[1]], actions: [], children: [], parent, parentAction, raises: 0, street: next, ctx, runout: -1, cards: deal.cards, weights: deal.weights });
    const kids = deal.ctx.map((c, k) => actionNode(next, 0, [inv[0], inv[1]], inv[0], 0, id, k, c));
    nodes[id].children = kids;
    return id;
  }

  function actionNode(street: 1 | 2 | 3, player: number, inv: [number, number], base: number, raises: number, parent: number, parentAction: number, ctx: number): number {
    const sc = cfg.streets[street];
    if (!sc) throw new Error(`No tree config for street ${street}`);
    const id = add({ type: NODE_ACTION, player, inv, actions: [], children: [], parent, parentAction, raises, street, ctx, runout: -1 });
    const node = nodes[id];
    const o = 1 - player;
    const toCall = inv[o] - inv[player];
    const potNow = cfg.pot + inv[0] + inv[1];
    const remaining = cfg.stack - inv[player];
    const explicitAllin = sc.allowAllin && (sc.allinMaxSpr == null || remaining <= sc.allinMaxSpr * potNow);
    const push = (a: TreeAction, makeChild: (idx: number) => number) => {
      const idx = node.actions.length;
      node.actions.push(a);
      node.children.push(-1);
      node.children[idx] = makeChild(idx);
    };

    if (toCall <= 1e-9) {
      // Checking: OOP passes the action; IP closes the street.
      push({ kind: 'check', to: inv[player], add: 0, frac: 0 }, (idx) =>
        player === 0 ? actionNode(street, 1, [inv[0], inv[1]], base, raises, id, idx, ctx) : closeStreet(street, [inv[0], inv[1]], id, idx, ctx),
      );
      if (remaining <= 1e-9) return id;
      const seen = new Set<number>();
      const sizes = player === 0 ? sc.oopBets : sc.ipBets;
      const placeBet = (amount: number, forceAllin: boolean) => {
        let kind: ActionKind = 'bet';
        let to = round2(inv[player] + amount);
        if (forceAllin || amount >= remaining * sc.allinFrac || to >= cfg.stack) {
          to = cfg.stack;
          kind = 'allin';
        }
        if (seen.has(to) || to <= inv[player] + 1e-9) return;
        seen.add(to);
        const addAmt = round2(to - inv[player]);
        const next: [number, number] = [inv[0], inv[1]];
        next[player] = to;
        push({ kind, to, add: addAmt, frac: addAmt / potNow }, (idx) => actionNode(street, o, next, base, raises, id, idx, ctx));
      };
      for (const f of sizes) placeBet(f * potNow, false);
      if (explicitAllin) placeBet(remaining, true);
    } else {
      push({ kind: 'fold', to: inv[player], add: 0, frac: 0 }, (idx) => leaf(NODE_FOLD, player, [inv[0], inv[1]], id, idx, street, ctx, -1));
      const callTo = Math.min(inv[o], cfg.stack);
      push({ kind: 'call', to: callTo, add: round2(callTo - inv[player]), frac: 0 }, (idx) => closeStreet(street, [callTo, callTo], id, idx, ctx));
      if (raises < sc.maxRaises && inv[o] < cfg.stack - 1e-9) {
        const seen = new Set<number>();
        const placeRaise = (target: number, forceAllin: boolean) => {
          let to = round2(target);
          let kind: ActionKind = 'raise';
          if (forceAllin || to - inv[player] >= remaining * sc.allinFrac || to >= cfg.stack) {
            to = cfg.stack;
            kind = 'allin';
          }
          if (seen.has(to) || to <= inv[o] + 1e-9) return;
          seen.add(to);
          const addAmt = round2(to - inv[player]);
          const next: [number, number] = [inv[0], inv[1]];
          next[player] = to;
          push({ kind, to, add: addAmt, frac: addAmt / potNow }, (idx) => actionNode(street, o, next, base, raises + 1, id, idx, ctx));
        };
        placeRaise(base + (inv[o] - base) * sc.raiseMult, false);
        if (explicitAllin) placeRaise(cfg.stack, true);
      }
    }
    return id;
  }

  actionNode(cfg.startStreet, 0, [0, 0], 0, 0, -1, -1, rootCtx);
  return nodes;
}

/** Single-street river tree (board context 0, showdown terminal 0). */
export function buildTree(cfg: TreeConfig): TreeNode[] {
  return buildMultiTree(
    { pot: cfg.pot, stack: cfg.stack, startStreet: 3, lastStreet: 3, streets: { 3: cfg } },
    {
      deal: () => {
        throw new Error('river trees deal no cards');
      },
      showdown: () => 0,
    },
    0,
  );
}

/** Path of (nodeId, actionIndex) steps from the root to `nodeId`. */
export function pathTo(nodes: TreeNode[], nodeId: number): { node: number; action: number }[] {
  const path: { node: number; action: number }[] = [];
  let cur = nodeId;
  while (nodes[cur].parent >= 0) {
    path.push({ node: nodes[cur].parent, action: nodes[cur].parentAction });
    cur = nodes[cur].parent;
  }
  return path.reverse();
}
