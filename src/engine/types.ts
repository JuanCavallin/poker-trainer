import type { ProfileId } from './profiles';
import type { TextureId, TextureInfo } from './texture';
import type { ActionKind } from './tree';

export type NodeType = 'oop-first' | 'ip-vs-check' | 'ip-vs-bet' | 'oop-vs-bet';

export const NODE_TYPES: NodeType[] = ['ip-vs-check', 'oop-first', 'ip-vs-bet', 'oop-vs-bet'];

export const NODE_TYPE_INFO: Record<NodeType, { label: string; short: string; blurb: string; facing: boolean }> = {
  'ip-vs-check': { label: 'Checked to you (IP)', short: 'IP vs check', blurb: 'Villain checks the river. Bet for value, bluff, or check back.', facing: false },
  'oop-first': { label: 'First to act (OOP)', short: 'OOP lead', blurb: 'You act first on the river. Lead out or check.', facing: false },
  'ip-vs-bet': { label: 'Facing a bet (IP)', short: 'IP vs bet', blurb: 'Villain bets into you. Fold, call, or raise.', facing: true },
  'oop-vs-bet': { label: 'Check, then facing a bet (OOP)', short: 'OOP vs bet', blurb: 'You checked and villain bet. Fold, call, or check-raise.', facing: true },
};

export type ActionKey = 'fold' | 'check' | 'call' | 'small' | 'big' | 'raise' | 'allin';

export interface SpotRequest {
  seed: number;
  nodeType?: NodeType;
  texture?: TextureId;
  scenarioId?: string;
  profile?: ProfileId;
  /** Permutation of the four suits, for isomorphic replays that look new. */
  suitPerm?: number[];
  /** Fixed five-card board (twins keep the flop and turn and swap the river). */
  board?: number[];
  /** Seed for the flop/turn simulation, so twins replay the same betting line. */
  lineSeed?: number;
  /** Preferred villain bet size (fraction of pot) when villain bets into you. */
  villainFrac?: number;
}

export interface ActionOption {
  key: ActionKey;
  kind: ActionKind;
  label: string;
  short: string;
  /** Chips this action puts in now. */
  add: number;
  /** Hero's total river investment after the action. */
  to: number;
  /** For bets/raises: chips added / pot at the decision. */
  frac: number;
  aggressive: boolean;
}

export interface RangeView {
  n: number;
  combos: Int16Array;
  /** Reach weight of each combo at the decision (0..1). */
  weights: Float32Array;
  strength: Int32Array;
  /** Showdown equity vs the opponent's range at the decision. */
  equity: Float32Array;
  cat: Uint8Array;
  flags: Uint8Array;
}

export interface HistoryStreet {
  street: 'Preflop' | 'Flop' | 'Turn' | 'River';
  cards: number[];
  pot: number;
  lines: string[];
}

export interface ActionTheory {
  /** Share of bluffs that makes the opponent indifferent to calling (s / (1 + 2s)). */
  bluffShare: number;
  /** Opponent's minimum defence frequency vs this bet (1 / (1 + s)). */
  villainMdf: number;
  /** How often a pure bluff must work to break even (s / (1 + s)). */
  alpha: number;
}

export interface Theory {
  /** Pot at the decision, including any villain bet. */
  pot: number;
  toCall: number;
  /** Equity needed to call: toCall / (pot + toCall). */
  requiredEquity: number;
  /** Share of your range that must continue so villain can't bluff any two cards. */
  mdf: number;
  villainBetFrac: number;
  /** Theoretical bluff share of villain's bet. */
  villainBluffShare: number;
  perAction: (ActionTheory | null)[];
}

export interface Solution {
  mode: 'gto' | 'exploit';
  /** Reference strategy (equilibrium, or best response vs an exploitable villain). Layout: i * nA + a. */
  strategy: Float32Array;
  /** EV in bb from the decision point (fold = 0) for each hero combo and action. */
  ev: Float32Array;
  /** Equilibrium strategy (same as `strategy` in GTO mode). */
  gtoStrategy: Float32Array;
  /** Hero equity vs villain's continuing range after each aggressive action (NaN otherwise). */
  contEq: Float32Array;
  /** Villain's fold frequency vs each hero action (NaN for passive actions). */
  villainFold: number[];
  iterations: number;
  solverExplPct: number;
}

export interface VillainHud {
  stats: { label: string; value: number; baseline: number }[];
  notes: string[];
}

export interface SpotPackage {
  id: string;
  request: SpotRequest;
  lineSeed: number;
  scenario: { id: string; name: string; potType: 'SRP' | '3BP'; oopPos: string; ipPos: string };
  board: number[];
  texture: TextureInfo;
  history: HistoryStreet[];
  heroSide: 0 | 1;
  heroPos: string;
  villainPos: string;
  nodeType: NodeType;
  family: string;
  profile: ProfileId;
  potStart: number;
  stackStart: number;
  pot: number;
  toCall: number;
  heroInv: number;
  villainInv: number;
  heroBehind: number;
  villainAction: { kind: 'none' | 'check' | 'bet' | 'allin'; amount: number; frac: number; label: string };
  heroPrior?: string;
  actions: ActionOption[];
  hero: RangeView;
  villain: RangeView;
  theory: Theory;
  solution: Solution;
  hud?: VillainHud;
  difficulty: number;
}

export const familyKey = (nodeType: NodeType, texture: TextureId): string => `${nodeType}|${texture}`;

export function parseFamily(key: string): { nodeType: NodeType; texture: TextureId } {
  const [nodeType, texture] = key.split('|');
  return { nodeType: nodeType as NodeType, texture: texture as TextureId };
}
