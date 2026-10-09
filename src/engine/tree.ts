/** Heads-up river betting tree. Player 0 = OOP (acts first), 1 = IP. */
export type ActionKind = 'check' | 'bet' | 'call' | 'fold' | 'raise' | 'allin';

export interface TreeAction {
  kind: ActionKind;
  /** Actor's total river investment after the action. */
  to: number;
  /** Chips added by this action. */
  add: number;
  /** For bets/raises: chips added divided by the pot before the action. */
  frac: number;
}

export const NODE_ACTION = 0;
export const NODE_FOLD = 1;
export const NODE_SHOWDOWN = 2;

export interface TreeNode {
  id: number;
  type: 0 | 1 | 2;
  /** Acting player (action nodes) or the folder (fold nodes); -1 for showdowns. */
  player: number;
  inv: [number, number];
  actions: TreeAction[];
  children: number[];
  parent: number;
  parentAction: number;
  raises: number;
}

export interface TreeConfig {
  pot: number;
  stack: number;
  oopBets: number[];
  ipBets: number[];
  /** Raise to this multiple of the opponent's total investment. */
  raiseMult: number;
  maxRaises: number;
  /** A bet or raise that would commit at least this share of the remaining stack goes all-in instead. */
  allinFrac: number;
  /** Offer an explicit all-in in addition to the sized bets/raises. */
  allowAllin: boolean;
}

export const DEFAULT_TREE: Omit<TreeConfig, 'pot' | 'stack'> = {
  oopBets: [0.33, 0.75],
  ipBets: [0.33, 0.75],
  raiseMult: 3,
  maxRaises: 1,
  allinFrac: 0.7,
  allowAllin: true,
};

const round2 = (x: number) => Math.round(x * 100) / 100;

export function buildTree(cfg: TreeConfig): TreeNode[] {
  const nodes: TreeNode[] = [];
  const add = (n: Omit<TreeNode, 'id'>): number => {
    const id = nodes.length;
    nodes.push({ ...n, id });
    return id;
  };
  const terminal = (type: 1 | 2, player: number, inv: [number, number], parent: number, parentAction: number, raises: number) =>
    add({ type, player, inv, actions: [], children: [], parent, parentAction, raises });

  function actionNode(player: number, inv: [number, number], raises: number, parent: number, parentAction: number): number {
    const id = add({ type: NODE_ACTION, player, inv, actions: [], children: [], parent, parentAction, raises });
    const node = nodes[id];
    const o = 1 - player;
    const toCall = inv[o] - inv[player];
    const potNow = cfg.pot + inv[0] + inv[1];
    const remaining = cfg.stack - inv[player];
    const push = (a: TreeAction, makeChild: (idx: number) => number) => {
      const idx = node.actions.length;
      node.actions.push(a);
      node.children.push(-1);
      node.children[idx] = makeChild(idx);
    };

    if (toCall <= 1e-9) {
      push({ kind: 'check', to: inv[player], add: 0, frac: 0 }, (idx) =>
        player === 0 ? actionNode(1, [inv[0], inv[1]], raises, id, idx) : terminal(NODE_SHOWDOWN, -1, [inv[0], inv[1]], id, idx, raises),
      );
      const seen = new Set<number>();
      const sizes = player === 0 ? cfg.oopBets : cfg.ipBets;
      const placeBet = (amount: number, forceAllin: boolean) => {
        let kind: ActionKind = 'bet';
        let to = round2(inv[player] + amount);
        if (forceAllin || amount >= remaining * cfg.allinFrac || to >= cfg.stack) {
          to = cfg.stack;
          kind = 'allin';
        }
        if (seen.has(to) || to <= inv[player] + 1e-9) return;
        seen.add(to);
        const addAmt = round2(to - inv[player]);
        const next: [number, number] = [inv[0], inv[1]];
        next[player] = to;
        push({ kind, to, add: addAmt, frac: addAmt / potNow }, (idx) => actionNode(o, next, raises, id, idx));
      };
      for (const f of sizes) placeBet(f * potNow, false);
      if (cfg.allowAllin && remaining > 1e-9) placeBet(remaining, true);
    } else {
      push({ kind: 'fold', to: inv[player], add: 0, frac: 0 }, (idx) => terminal(NODE_FOLD, player, [inv[0], inv[1]], id, idx, raises));
      const callTo = Math.min(inv[o], cfg.stack);
      const callInv: [number, number] = [callTo, callTo];
      push({ kind: 'call', to: callTo, add: round2(callTo - inv[player]), frac: 0 }, (idx) => terminal(NODE_SHOWDOWN, -1, callInv, id, idx, raises));
      if (raises < cfg.maxRaises && inv[o] < cfg.stack - 1e-9) {
        const seen = new Set<number>();
        const placeRaise = (target: number, forceAllin: boolean) => {
          let to = round2(target);
          let kind: ActionKind = 'raise';
          if (forceAllin || to - inv[player] >= remaining * cfg.allinFrac || to >= cfg.stack) {
            to = cfg.stack;
            kind = 'allin';
          }
          if (seen.has(to) || to <= inv[o] + 1e-9) return;
          seen.add(to);
          const addAmt = round2(to - inv[player]);
          const next: [number, number] = [inv[0], inv[1]];
          next[player] = to;
          push({ kind, to, add: addAmt, frac: addAmt / potNow }, (idx) => actionNode(o, next, raises + 1, id, idx));
        };
        placeRaise(inv[o] * cfg.raiseMult, false);
        if (cfg.allowAllin) placeRaise(cfg.stack, true);
      }
    }
    return id;
  }

  actionNode(0, [0, 0], 0, -1, -1);
  return nodes;
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
