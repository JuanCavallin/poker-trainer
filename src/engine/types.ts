import type { Position } from './seats';
import type { ProfileId } from './profiles';
import type { TextureId, TextureInfo } from './texture';
import type { ActionKind } from './tree';

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
export const POSTFLOP_STREETS: Street[] = ['flop', 'turn', 'river'];
export const STREET_LABEL: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };

export type PostflopNode = 'oop-first' | 'ip-vs-check' | 'ip-vs-bet' | 'oop-vs-bet';
export type PreflopNode = 'rfi' | 'vs-open' | 'vs-3bet' | 'vs-4bet';
export type NodeType = PostflopNode | PreflopNode;

/** Postflop decision types (the same four on the flop, turn and river). */
export const NODE_TYPES: PostflopNode[] = ['ip-vs-check', 'oop-first', 'ip-vs-bet', 'oop-vs-bet'];
export const PREFLOP_NODE_TYPES: PreflopNode[] = ['rfi', 'vs-open', 'vs-3bet', 'vs-4bet'];
export const isPreflopNode = (n: NodeType): n is PreflopNode => (PREFLOP_NODE_TYPES as string[]).includes(n);
export const nodeTypesFor = (street: Street): NodeType[] => (street === 'preflop' ? PREFLOP_NODE_TYPES : NODE_TYPES);

export const NODE_TYPE_INFO: Record<NodeType, { label: string; short: string; blurb: string; facing: boolean }> = {
  'ip-vs-check': { label: 'Checked to you (IP)', short: 'IP vs check', blurb: 'Villain checks. Bet for value, bluff, or check back.', facing: false },
  'oop-first': { label: 'First to act (OOP)', short: 'OOP first', blurb: 'You act first. Lead out or check.', facing: false },
  'ip-vs-bet': { label: 'Facing a bet (IP)', short: 'IP vs bet', blurb: 'Villain bets into you. Fold, call, or raise.', facing: true },
  'oop-vs-bet': { label: 'Check, then facing a bet (OOP)', short: 'OOP vs bet', blurb: 'You checked and villain bet. Fold, call, or check-raise.', facing: true },
  rfi: { label: 'First in (open or fold)', short: 'Open', blurb: 'Everyone folds to you. Open-raise or fold.', facing: false },
  'vs-open': { label: 'Facing an open', short: 'vs open', blurb: 'Villain opened. Fold, call, or 3-bet.', facing: true },
  'vs-3bet': { label: 'Facing a 3-bet', short: 'vs 3-bet', blurb: 'You opened and villain 3-bet. Fold, call, or 4-bet.', facing: true },
  'vs-4bet': { label: 'Facing a 4-bet', short: 'vs 4-bet', blurb: 'You 3-bet and villain 4-bet. Fold, call, or jam.', facing: true },
};

export type ActionKey = 'fold' | 'check' | 'call' | 'small' | 'big' | 'raise' | 'allin';
export type PotType = 'SRP' | '3BP' | '4BP';

export interface SpotRequest {
  seed: number;
  /** Decision street (default: river, or preflop for a preflop node type). */
  street?: Street;
  nodeType?: NodeType;
  texture?: TextureId;
  /** Your seat and the villain's seat (random when omitted). */
  heroPos?: Position;
  villainPos?: Position;
  /** Postflop: single-raised or 3-bet pot (random when omitted). */
  potType?: 'SRP' | '3BP';
  /** Legacy river-only requests: 'btn-bb' | 'co-btn' | 'sb-bb' | 'btn-bb-3bp'. */
  scenarioId?: string;
  profile?: ProfileId;
  /** Permutation of the four suits, for isomorphic replays that look new. */
  suitPerm?: number[];
  /** Fixed board for the decision street (twins keep the earlier cards and swap the last one). */
  board?: number[];
  /** Seed for sampling the earlier betting line, so twins replay the same line. */
  lineSeed?: number;
  /** Preferred villain bet size (fraction of pot) when villain bets into you. */
  villainFrac?: number;
  /** Flop and turn spots: the next card the solve assumes (turn on the flop, river on the turn). Random when omitted. */
  nextCard?: number;
  /** Re-solve the exact same spot (same line and board), never re-rolling it; used when changing `nextCard`. */
  keepLine?: boolean;
}

export interface ActionOption {
  key: ActionKey;
  kind: ActionKind;
  label: string;
  short: string;
  /** Chips this action puts in now. */
  add: number;
  /** Hero's total investment in this street's betting after the action. */
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
  /** Made-hand strength on the current board (preflop: strength rank). */
  strength: Int32Array;
  /** Equity vs the opponent's range at the decision (all-in equity before the river). */
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

/** One action on the way to the decision, with the range of the player who took it. */
export interface LineStep {
  street: Street;
  actor: 'hero' | 'villain';
  pos: string;
  /** e.g. "BTN raises to 2.5bb". */
  text: string;
  /** Short action label for the drawing prompt, e.g. "opening", "calling", "c-betting 33%". */
  verb: string;
  /** Board when the action was taken. */
  board: number[];
  /** The actor's range after the action, as combo weights (1326). */
  range: Float32Array;
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
  /** Whether a balance (exploitability) score can be computed for a submitted range. */
  balance: boolean;
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
  /** How the decision street was modelled, for the "about this solve" note. */
  model: string;
}

export interface VillainHud {
  stats: { label: string; value: number; baseline: number }[];
  notes: string[];
}

export interface SpotPackage {
  id: string;
  request: SpotRequest;
  lineSeed: number;
  street: Street;
  scenario: { id: string; name: string; potType: PotType; oopPos: string; ipPos: string };
  board: number[];
  /** Flop and turn spots: the next card the solve assumes; hands holding it are left out of this solve. */
  nextCard?: number;
  texture: TextureInfo;
  history: HistoryStreet[];
  /** Every action before the decision, with the actor's range after it. */
  line: LineStep[];
  heroSide: 0 | 1;
  heroPos: string;
  villainPos: string;
  heroIp: boolean;
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
  villainBehind: number;
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

/** River families keep their original keys so saved progress carries over. */
export function familyKey(street: Street, nodeType: NodeType, texture: string): string {
  if (street === 'river') return `${nodeType}|${texture}`;
  const prefix = street === 'preflop' ? 'pre' : street;
  return `${prefix}:${nodeType}|${texture}`;
}

export function parseFamily(key: string): { street: Street; nodeType: NodeType; texture: string } {
  let street: Street = 'river';
  let rest = key;
  const colon = key.indexOf(':');
  if (colon >= 0) {
    const p = key.slice(0, colon);
    street = p === 'pre' ? 'preflop' : (p as Street);
    rest = key.slice(colon + 1);
  }
  const [nodeType, texture] = rest.split('|');
  return { street, nodeType: nodeType as NodeType, texture };
}
