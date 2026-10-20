import { rankOf, suitOf } from './cards';
import { STRAIGHT_HIGH } from './evaluator';

export type RiverTexture = 'dry' | 'paired' | 'connected' | 'flushy' | 'flush-river' | 'straight-river';
export type FlopTexture = 'f-dry' | 'f-paired' | 'f-connected' | 'f-twotone' | 'f-monotone';
export type TurnTexture = 't-blank' | 't-overcard' | 't-paired' | 't-flush' | 't-straight';
export type TextureId = RiverTexture | FlopTexture | TurnTexture | 'preflop';

export const TEXTURE_IDS: RiverTexture[] = ['dry', 'paired', 'connected', 'flushy', 'flush-river', 'straight-river'];
export const FLOP_TEXTURE_IDS: FlopTexture[] = ['f-dry', 'f-paired', 'f-connected', 'f-twotone', 'f-monotone'];
export const TURN_TEXTURE_IDS: TurnTexture[] = ['t-blank', 't-overcard', 't-paired', 't-flush', 't-straight'];

export const texturesFor = (street: 'flop' | 'turn' | 'river'): TextureId[] =>
  street === 'flop' ? FLOP_TEXTURE_IDS : street === 'turn' ? TURN_TEXTURE_IDS : TEXTURE_IDS;

export const TEXTURES: Record<TextureId, { label: string; blurb: string; plant: string; hue: number }> = {
  dry: { label: 'Dry', blurb: 'Unpaired, no flush, few straights. Ranges stay far apart.', plant: 'Cactus', hue: 95 },
  paired: { label: 'Paired', blurb: 'The board pairs: trips and full houses lurk, top pair shrinks.', plant: 'Twin fern', hue: 140 },
  connected: { label: 'Connected', blurb: 'Lots of straights are possible. Nut hands are spread out.', plant: 'Ivy', hue: 165 },
  flushy: { label: 'Flush board', blurb: 'Three of a suit arrived before the river.', plant: 'Bluebell', hue: 215 },
  'flush-river': { label: 'Flush completes', blurb: 'The river brings the third suited card. Who has more flushes?', plant: 'Tulip', hue: 330 },
  'straight-river': { label: 'Straight completes', blurb: 'The river makes straights possible for the first time.', plant: 'Sunflower', hue: 45 },
  'f-dry': { label: 'Dry flop', blurb: 'Rainbow, unpaired and disconnected. The preflop raiser usually has the edge.', plant: 'Agave', hue: 80 },
  'f-paired': { label: 'Paired flop', blurb: 'A pair on the flop: few hands connect, so small bets go a long way.', plant: 'Clover', hue: 125 },
  'f-connected': { label: 'Connected flop', blurb: 'Straights and straight draws everywhere. The caller often has more two-pair+.', plant: 'Fern', hue: 175 },
  'f-twotone': { label: 'Two-tone flop', blurb: 'Two of a suit: flush draws join the fight.', plant: 'Hydrangea', hue: 200 },
  'f-monotone': { label: 'Monotone flop', blurb: 'Three of a suit. Made flushes now, and every suited card is a draw.', plant: 'Iris', hue: 250 },
  't-blank': { label: 'Blank turn', blurb: 'A low card that changes little. The flop story continues.', plant: 'Moss', hue: 70 },
  't-overcard': { label: 'Overcard turn', blurb: 'A card higher than the flop: top pair changes hands.', plant: 'Poppy', hue: 15 },
  't-paired': { label: 'Board-pairing turn', blurb: 'The turn pairs the board: trips and boats appear.', plant: 'Twin bud', hue: 150 },
  't-flush': { label: 'Flush-completing turn', blurb: 'The third suited card lands on the turn.', plant: 'Lily', hue: 300 },
  't-straight': { label: 'Straight-completing turn', blurb: 'The turn makes straights possible.', plant: 'Daisy', hue: 50 },
  preflop: { label: 'Preflop', blurb: 'No board yet.', plant: 'Acorn', hue: 30 },
};

export interface TextureInfo {
  id: TextureId;
  tags: string[];
  flushSuit: number;
  maxSuit: number;
  pairedness: number;
  straightCombos: number;
  fourStraight: boolean;
  topRank: number;
}

function suitCounts(cards: readonly number[]): number[] {
  const sc = [0, 0, 0, 0];
  for (const c of cards) sc[suitOf(c)]++;
  return sc;
}

function rankMask(cards: readonly number[]): number {
  let m = 0;
  for (const c of cards) m |= 1 << rankOf(c);
  return m;
}

/** Number of distinct two-card rank holdings that make a straight with this board. */
export function straightCombos(cards: readonly number[]): number {
  const bm = rankMask(cards);
  let n = 0;
  for (let a = 0; a < 13; a++) {
    for (let b = a + 1; b < 13; b++) {
      const m = bm | (1 << a) | (1 << b);
      if (STRAIGHT_HIGH[m] >= 0 && STRAIGHT_HIGH[bm] < 0) n++;
    }
  }
  // One-card straights (four to a straight on board).
  for (let a = 0; a < 13; a++) {
    if (STRAIGHT_HIGH[bm | (1 << a)] >= 0 && STRAIGHT_HIGH[bm] < 0) n++;
  }
  return n;
}

function maxWindow(cards: readonly number[]): number {
  const bm = rankMask(cards);
  let best = 0;
  for (let hi = 4; hi <= 12; hi++) {
    let cnt = 0;
    for (let r = hi - 4; r <= hi; r++) if (bm & (1 << r)) cnt++;
    best = Math.max(best, cnt);
  }
  let wheel = 0;
  for (const r of [12, 0, 1, 2, 3]) if (bm & (1 << r)) wheel++;
  return Math.max(best, wheel);
}

function pairednessOf(cards: readonly number[]): number {
  const rc = new Array(13).fill(0);
  for (const c of cards) rc[rankOf(c)]++;
  const pairs = rc.filter((n) => n === 2).length;
  const trips = rc.some((n) => n >= 3);
  return trips ? 3 : pairs >= 2 ? 2 : pairs;
}

function classifyFlop(board: readonly number[]): TextureId {
  const maxSuit = Math.max(...suitCounts(board));
  if (maxSuit === 3) return 'f-monotone';
  if (pairednessOf(board) > 0) return 'f-paired';
  if (maxWindow(board) >= 3) return 'f-connected';
  if (maxSuit === 2) return 'f-twotone';
  return 'f-dry';
}

function classifyTurn(board: readonly number[]): TextureId {
  const flop = board.slice(0, 3);
  const turn = board[3];
  if (Math.max(...suitCounts(board)) >= 3 && Math.max(...suitCounts(flop)) < 3) return 't-flush';
  if (straightCombos(board) > straightCombos(flop) + 2 || (maxWindow(board) >= 4 && maxWindow(flop) < 4)) return 't-straight';
  if (flop.some((c) => rankOf(c) === rankOf(turn))) return 't-paired';
  if (rankOf(turn) > Math.max(...flop.map(rankOf))) return 't-overcard';
  return 't-blank';
}

export function classifyTexture(board: readonly number[]): TextureInfo {
  if (board.length === 0) return { id: 'preflop', tags: [], flushSuit: -1, maxSuit: 0, pairedness: 0, straightCombos: 0, fourStraight: false, topRank: -1 };
  const sc = suitCounts(board);
  const maxSuit = Math.max(...sc);
  const flushSuit = maxSuit >= 3 ? sc.indexOf(maxSuit) : -1;
  const pairedness = pairednessOf(board);
  const sc5 = straightCombos(board);
  const fourStraight = maxWindow(board) >= 4;
  const topRank = Math.max(...board.map(rankOf));

  let id: TextureId;
  if (board.length === 3) id = classifyFlop(board);
  else if (board.length === 4) id = classifyTurn(board);
  else {
    const turn = board.slice(0, 4);
    const turnMaxSuit = Math.max(...suitCounts(turn));
    const sc4 = straightCombos(turn);
    const fourStraightTurn = maxWindow(turn) >= 4;
    if (maxSuit >= 3 && turnMaxSuit < 3) id = 'flush-river';
    else if (maxSuit < 3 && sc5 > 0 && (sc4 === 0 || (fourStraight && !fourStraightTurn))) id = 'straight-river';
    else if (maxSuit >= 3) id = 'flushy';
    else if (pairedness > 0) id = 'paired';
    else if (sc5 >= 3) id = 'connected';
    else id = 'dry';
  }

  const tags: string[] = [];
  if (topRank === 12) tags.push('Ace-high');
  else if (topRank === 11) tags.push('King-high');
  else if (topRank <= 7) tags.push('Low board');
  if (pairedness === 2) tags.push('Double-paired');
  if (pairedness === 3) tags.push('Trips on board');
  if (maxSuit >= 4) tags.push('Four-flush');
  else if (maxSuit === 2 && board.length < 5) tags.push('Flush draw possible');
  if (fourStraight) tags.push('Four to a straight');
  if (maxSuit <= 2 && board.length === 5) tags.push('No flush');
  if (maxSuit <= 1) tags.push('Rainbow');

  return { id, tags, flushSuit, maxSuit, pairedness, straightCombos: sc5, fourStraight, topRank };
}
