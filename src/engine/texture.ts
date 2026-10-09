import { rankOf, suitOf } from './cards';
import { STRAIGHT_HIGH } from './evaluator';

export type TextureId = 'dry' | 'paired' | 'connected' | 'flushy' | 'flush-river' | 'straight-river';

export const TEXTURE_IDS: TextureId[] = ['dry', 'paired', 'connected', 'flushy', 'flush-river', 'straight-river'];

export const TEXTURES: Record<TextureId, { label: string; blurb: string; plant: string; hue: number }> = {
  dry: { label: 'Dry', blurb: 'Unpaired, no flush, few straights. Ranges stay far apart.', plant: 'Cactus', hue: 95 },
  paired: { label: 'Paired', blurb: 'The board pairs: trips and full houses lurk, top pair shrinks.', plant: 'Twin fern', hue: 140 },
  connected: { label: 'Connected', blurb: 'Lots of straights are possible. Nut hands are spread out.', plant: 'Ivy', hue: 165 },
  flushy: { label: 'Flush board', blurb: 'Three of a suit arrived before the river.', plant: 'Bluebell', hue: 215 },
  'flush-river': { label: 'Flush completes', blurb: 'The river brings the third suited card. Who has more flushes?', plant: 'Tulip', hue: 330 },
  'straight-river': { label: 'Straight completes', blurb: 'The river makes straights possible for the first time.', plant: 'Sunflower', hue: 45 },
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

export function classifyTexture(board: readonly number[]): TextureInfo {
  const turn = board.slice(0, 4);
  const sc = suitCounts(board);
  const maxSuit = Math.max(...sc);
  const flushSuit = maxSuit >= 3 ? sc.indexOf(maxSuit) : -1;
  const turnMaxSuit = Math.max(...suitCounts(turn));
  const rc = new Array(13).fill(0);
  for (const c of board) rc[rankOf(c)]++;
  const pairs = rc.filter((n) => n === 2).length;
  const trips = rc.some((n) => n >= 3);
  const pairedness = trips ? 3 : pairs >= 2 ? 2 : pairs;
  const sc5 = straightCombos(board);
  const sc4 = straightCombos(turn);
  const fourStraight = maxWindow(board) >= 4;
  const fourStraightTurn = maxWindow(turn) >= 4;
  const topRank = Math.max(...board.map(rankOf));

  let id: TextureId;
  if (maxSuit >= 3 && turnMaxSuit < 3) id = 'flush-river';
  else if (maxSuit < 3 && sc5 > 0 && (sc4 === 0 || (fourStraight && !fourStraightTurn))) id = 'straight-river';
  else if (maxSuit >= 3) id = 'flushy';
  else if (pairedness > 0) id = 'paired';
  else if (sc5 >= 3) id = 'connected';
  else id = 'dry';

  const tags: string[] = [];
  if (topRank === 12) tags.push('Ace-high');
  else if (topRank === 11) tags.push('King-high');
  else if (topRank <= 7) tags.push('Low board');
  if (pairedness === 2) tags.push('Double-paired');
  if (pairedness === 3) tags.push('Trips on board');
  if (maxSuit >= 4) tags.push('Four-flush');
  if (fourStraight) tags.push('Four to a straight');
  if (maxSuit <= 2) tags.push('No flush');

  return { id, tags, flushSuit, maxSuit, pairedness, straightCombos: sc5, fourStraight, topRank };
}
