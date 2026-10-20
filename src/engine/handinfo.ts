import { RANK_PLURALS, RANK_WORDS, RANKS, rankOf, suitOf } from './cards';
import { classKind, classRanks, comboClass, comboId } from './combos';
import { CAT, STRAIGHT_HIGH, evaluate, evaluateWith } from './evaluator';

/** Hand categories, roughly strongest to weakest: postflop made hands, draws, air, then preflop groups. */
export const HAND_CATS = [
  { key: 'monster', label: 'Quads / straight flush', short: 'Quads+' },
  { key: 'fullhouse', label: 'Full house', short: 'Full house' },
  { key: 'flush', label: 'Flush', short: 'Flush' },
  { key: 'straight', label: 'Straight', short: 'Straight' },
  { key: 'set', label: 'Set', short: 'Set' },
  { key: 'trips', label: 'Trips', short: 'Trips' },
  { key: 'twopair', label: 'Two pair', short: 'Two pair' },
  { key: 'overpair', label: 'Overpair', short: 'Overpair' },
  { key: 'toppair', label: 'Top pair', short: 'Top pair' },
  { key: 'secondpair', label: 'Second pair', short: '2nd pair' },
  { key: 'weakpair', label: 'Weak pair', short: 'Weak pair' },
  { key: 'combodraw', label: 'Combo draw', short: 'Combo draw' },
  { key: 'flushdraw', label: 'Flush draw', short: 'Flush draw' },
  { key: 'oesd', label: 'Open-ended straight draw', short: 'Open-ender' },
  { key: 'gutshot', label: 'Gutshot', short: 'Gutshot' },
  { key: 'overcards', label: 'Two overcards', short: 'Overcards' },
  { key: 'acehigh', label: 'Ace high', short: 'Ace high' },
  { key: 'misseddraw', label: 'Missed draw', short: 'Missed draw' },
  { key: 'nothing', label: 'No pair', short: 'No pair' },
  { key: 'board', label: 'Plays the board', short: 'Board' },
  { key: 'p-bigpair', label: 'Big pairs (TT+)', short: 'Big pairs' },
  { key: 'p-midpair', label: 'Middle pairs (66–99)', short: 'Mid pairs' },
  { key: 'p-smallpair', label: 'Small pairs (22–55)', short: 'Small pairs' },
  { key: 'p-suitedace', label: 'Suited aces', short: 'Axs' },
  { key: 'p-suitedbroadway', label: 'Suited broadways', short: 'Suited Bwy' },
  { key: 'p-suitedconnector', label: 'Suited connectors & gappers', short: 'Suited conn.' },
  { key: 'p-suitedother', label: 'Other suited', short: 'Other suited' },
  { key: 'p-offbroadway', label: 'Offsuit broadways', short: 'Offsuit Bwy' },
  { key: 'p-offace', label: 'Offsuit aces', short: 'Axo' },
  { key: 'p-offconnector', label: 'Offsuit connectors', short: 'Offsuit conn.' },
  { key: 'p-offother', label: 'Other offsuit', short: 'Offsuit junk' },
] as const;

export const HC = {
  MONSTER: 0,
  FULLHOUSE: 1,
  FLUSH: 2,
  STRAIGHT: 3,
  SET: 4,
  TRIPS: 5,
  TWOPAIR: 6,
  OVERPAIR: 7,
  TOPPAIR: 8,
  SECONDPAIR: 9,
  WEAKPAIR: 10,
  COMBODRAW: 11,
  FLUSHDRAW: 12,
  OESD: 13,
  GUTSHOT: 14,
  OVERCARDS: 15,
  ACEHIGH: 16,
  MISSEDDRAW: 17,
  NOTHING: 18,
  BOARD: 19,
  /** First preflop group; preflop categories run from here to the end of HAND_CATS. */
  PRE_FIRST: 20,
} as const;

export const HF = {
  NUT: 1,
  MISSED_FD: 2,
  MISSED_SD: 4,
  NUT_FLUSH_BLOCKER: 8,
  FLUSH_BLOCKER: 16,
  /** Live draws on the flop or turn. */
  FLUSH_DRAW: 32,
  STRAIGHT_DRAW: 64,
} as const;

export interface HandDesc {
  cat: number;
  label: string;
  flags: number;
}

function flushSuitOf(board: readonly number[]): number {
  const sc = [0, 0, 0, 0];
  for (const c of board) sc[suitOf(c)]++;
  const m = Math.max(...sc);
  return m >= 3 ? sc.indexOf(m) : -1;
}

function boardRankMask(cards: readonly number[]): number {
  let m = 0;
  for (const c of cards) m |= 1 << rankOf(c);
  return m;
}

/** True if no straight higher than `high` can be made on this board with any two cards. */
function isNutStraight(board: readonly number[], high: number): boolean {
  const bm = boardRankMask(board);
  for (let h = 12; h > high; h--) {
    let missing = 0;
    for (let r = h - 4; r <= h; r++) if (!(bm & (1 << r))) missing++;
    if (missing <= 2) return false;
  }
  return true;
}

function missedDraws(board: readonly number[], c1: number, c2: number): number {
  if (board.length < 5) return 0;
  const turn = board.slice(0, 4);
  let flags = 0;
  for (let s = 0; s < 4; s++) {
    const hole = (suitOf(c1) === s ? 1 : 0) + (suitOf(c2) === s ? 1 : 0);
    if (hole === 0) continue;
    let cnt = hole;
    for (const c of turn) if (suitOf(c) === s) cnt++;
    if (cnt >= 4) flags |= HF.MISSED_FD;
  }
  const tm = boardRankMask(turn);
  const hm = tm | (1 << rankOf(c1)) | (1 << rankOf(c2));
  if (STRAIGHT_HIGH[hm] < 0) {
    let outs = 0;
    for (let r = 0; r < 13; r++) {
      if (STRAIGHT_HIGH[hm | (1 << r)] >= 0 && STRAIGHT_HIGH[tm | (1 << r)] < 0) outs++;
    }
    if (outs > 0) flags |= HF.MISSED_SD;
  }
  return flags;
}

/** Live draws on a flop or turn: flush draw and straight-draw outs (by rank). */
function liveDraws(board: readonly number[], c1: number, c2: number): { fd: boolean; outs: number } {
  let fd = false;
  for (let s = 0; s < 4; s++) {
    const hole = (suitOf(c1) === s ? 1 : 0) + (suitOf(c2) === s ? 1 : 0);
    if (!hole) continue;
    let cnt = hole;
    for (const c of board) if (suitOf(c) === s) cnt++;
    if (cnt === 4) fd = true;
  }
  const bm = boardRankMask(board);
  const hm = bm | (1 << rankOf(c1)) | (1 << rankOf(c2));
  let outs = 0;
  if (STRAIGHT_HIGH[hm] < 0) {
    for (let r = 0; r < 13; r++) if (STRAIGHT_HIGH[hm | (1 << r)] >= 0 && STRAIGHT_HIGH[bm | (1 << r)] < 0) outs++;
  }
  return { fd, outs };
}

/** Preflop group (HAND_CATS index) of a hand class. */
export function preflopCategory(cls: number): number {
  const [hi, lo] = classRanks(cls);
  const kind = classKind(cls);
  if (kind === 'pair') return hi >= 8 ? HC.PRE_FIRST : hi >= 4 ? HC.PRE_FIRST + 1 : HC.PRE_FIRST + 2;
  const gap = hi === 12 && lo <= 3 ? lo : hi - lo - 1;
  if (kind === 'suited') {
    if (hi >= 8 && lo >= 8) return HC.PRE_FIRST + 4;
    if (hi === 12) return HC.PRE_FIRST + 3;
    if (gap <= 1) return HC.PRE_FIRST + 5;
    return HC.PRE_FIRST + 6;
  }
  if (hi >= 8 && lo >= 8) return HC.PRE_FIRST + 7;
  if (hi === 12) return HC.PRE_FIRST + 8;
  if (gap === 0 && lo >= 3) return HC.PRE_FIRST + 9;
  return HC.PRE_FIRST + 10;
}

function describePreflop(a: number, b: number): HandDesc {
  const cls = comboClass[comboId(a, b)];
  const [hi, lo] = classRanks(cls);
  const kind = classKind(cls);
  const label =
    kind === 'pair'
      ? `Pocket ${RANK_PLURALS[hi].toLowerCase()}`
      : `${RANK_WORDS[hi]}-${RANK_WORDS[lo].toLowerCase()} ${kind === 'suited' ? 'suited' : 'offsuit'}`;
  return { cat: preflopCategory(cls), label, flags: 0 };
}

/** Describes a two-card holding: preflop (no board), on the flop or turn (with live draws), or on the river. */
export function describeHand(board: readonly number[], a: number, b: number): HandDesc {
  if (board.length === 0) return describePreflop(a, b);
  const d = describeMade(board, a, b);
  if (board.length >= 5) return d;
  const { fd, outs } = liveDraws(board, a, b);
  if (!fd && outs === 0) {
    if (d.cat === HC.NOTHING || d.cat === HC.ACEHIGH) {
      const top = Math.max(...board.map(rankOf));
      if (rankOf(a) > top && rankOf(b) > top) return { cat: HC.OVERCARDS, label: `Two overcards (${RANKS[Math.max(rankOf(a), rankOf(b))]}${RANKS[Math.min(rankOf(a), rankOf(b))]})`, flags: d.flags };
    }
    return d;
  }
  const flags = d.flags | (fd ? HF.FLUSH_DRAW : 0) | (outs > 0 ? HF.STRAIGHT_DRAW : 0);
  const drawName = fd && outs > 0 ? 'combo draw' : fd ? 'flush draw' : outs >= 2 ? 'open-ended straight draw' : 'gutshot';
  if (d.cat === HC.NOTHING || d.cat === HC.ACEHIGH || d.cat === HC.BOARD) {
    const cat = fd && outs > 0 ? HC.COMBODRAW : fd ? HC.FLUSHDRAW : outs >= 2 ? HC.OESD : HC.GUTSHOT;
    return { cat, label: drawName[0].toUpperCase() + drawName.slice(1), flags };
  }
  if (d.cat <= HC.STRAIGHT) return { ...d, flags };
  return { cat: d.cat, label: `${d.label} + ${drawName}`, flags };
}

function describeMade(board: readonly number[], a: number, b: number): HandDesc {
  const c1 = rankOf(a) >= rankOf(b) ? a : b;
  const c2 = c1 === a ? b : a;
  const r1 = rankOf(c1);
  const r2 = rankOf(c2);
  const v = evaluateWith(board, c1, c2);
  const cat = v >> 20;
  const bv = evaluate(board, board.length);
  const rc = new Array(13).fill(0);
  for (const c of board) rc[rankOf(c)]++;
  const distinct = [...new Set(board.map(rankOf))].sort((x, y) => y - x);
  const fs = flushSuitOf(board);
  let flags = 0;

  if (fs >= 0 && cat !== CAT.FLUSH && cat !== CAT.STRAIGHT_FLUSH) {
    let highestMissing = -1;
    for (let r = 12; r >= 0; r--) {
      if (!board.some((c) => rankOf(c) === r && suitOf(c) === fs)) {
        highestMissing = r;
        break;
      }
    }
    if ((suitOf(c1) === fs && r1 === highestMissing) || (suitOf(c2) === fs && r2 === highestMissing)) flags |= HF.NUT_FLUSH_BLOCKER;
    else if (suitOf(c1) === fs || suitOf(c2) === fs) flags |= HF.FLUSH_BLOCKER;
  }

  if (v === bv) return { cat: HC.BOARD, label: 'Plays the board', flags };

  const pairLike = (p: number): HandDesc => {
    const idx = distinct.indexOf(p);
    const kicker = r1 === p ? r2 : r1;
    if (idx === 0) return { cat: HC.TOPPAIR, label: `Top pair (${RANKS[p]}), ${RANK_WORDS[kicker].toLowerCase()} kicker`, flags };
    if (idx === 1) return { cat: HC.SECONDPAIR, label: `Second pair (${RANK_PLURALS[p].toLowerCase()})`, flags };
    return { cat: HC.WEAKPAIR, label: `Weak pair (${RANK_PLURALS[p].toLowerCase()})`, flags };
  };
  const pocketPair = (p: number): HandDesc => {
    if (p > distinct[0]) return { cat: HC.OVERPAIR, label: `Overpair (${RANKS[p]}${RANKS[p]})`, flags };
    if (distinct.length > 1 && p > distinct[1]) return { cat: HC.SECONDPAIR, label: `Pocket ${RANK_PLURALS[p].toLowerCase()} below the top card`, flags };
    return { cat: HC.WEAKPAIR, label: `Underpair (${RANKS[p]}${RANKS[p]})`, flags };
  };
  const noPair = (): HandDesc => {
    const md = missedDraws(board, c1, c2);
    flags |= md;
    if (r1 === 12 && rc[12] === 0) {
      const extra = md & HF.MISSED_FD ? ' (missed flush draw)' : md & HF.MISSED_SD ? ' (missed straight draw)' : '';
      return { cat: HC.ACEHIGH, label: `Ace high${extra}`, flags };
    }
    if (md) {
      const label = md & HF.MISSED_FD && md & HF.MISSED_SD ? 'Missed combo draw' : md & HF.MISSED_FD ? 'Missed flush draw' : 'Missed straight draw';
      return { cat: HC.MISSEDDRAW, label, flags };
    }
    return { cat: HC.NOTHING, label: `${RANK_WORDS[r1]} high`, flags };
  };

  switch (cat) {
    case CAT.STRAIGHT_FLUSH:
      return { cat: HC.MONSTER, label: 'Straight flush', flags: flags | HF.NUT };
    case CAT.QUADS:
      return { cat: HC.MONSTER, label: `Quad ${RANK_PLURALS[(v >> 16) & 15].toLowerCase()}`, flags };
    case CAT.FULL_HOUSE:
      return { cat: HC.FULLHOUSE, label: `Full house, ${RANK_PLURALS[(v >> 16) & 15].toLowerCase()} full`, flags };
    case CAT.FLUSH: {
      const s = fs;
      const heroTop = Math.max(suitOf(c1) === s ? r1 : -1, suitOf(c2) === s ? r2 : -1);
      let nut = true;
      for (let r = 12; r > heroTop; r--) {
        if (!board.some((c) => rankOf(c) === r && suitOf(c) === s)) {
          nut = false;
          break;
        }
      }
      if (heroTop < 0) return { cat: HC.BOARD, label: 'Flush on board', flags };
      return nut
        ? { cat: HC.FLUSH, label: 'Nut flush', flags: flags | HF.NUT }
        : { cat: HC.FLUSH, label: `${RANK_WORDS[heroTop]}-high flush`, flags };
    }
    case CAT.STRAIGHT: {
      const high = (v >> 16) & 15;
      const nut = isNutStraight(board, high);
      return nut
        ? { cat: HC.STRAIGHT, label: `Nut straight (${RANKS[high]}-high)`, flags: flags | HF.NUT }
        : { cat: HC.STRAIGHT, label: `Straight (${RANKS[high]}-high)`, flags };
    }
    case CAT.TRIPS: {
      const t = (v >> 16) & 15;
      if (r1 === r2 && r1 === t) return { cat: HC.SET, label: `Set of ${RANK_PLURALS[t].toLowerCase()}`, flags };
      if (r1 === t || r2 === t) {
        const kicker = r1 === t ? r2 : r1;
        return { cat: HC.TRIPS, label: `Trip ${RANK_PLURALS[t].toLowerCase()}, ${RANK_WORDS[kicker].toLowerCase()} kicker`, flags };
      }
      return noPair();
    }
    case CAT.TWO_PAIR: {
      const p1 = (v >> 16) & 15;
      const p2 = (v >> 12) & 15;
      if (r1 === r2) {
        if (r1 === p1 || r1 === p2) return pocketPair(r1);
        return { cat: HC.WEAKPAIR, label: `Pocket ${RANK_PLURALS[r1].toLowerCase()} (counterfeited)`, flags };
      }
      const mine = (p: number) => rc[p] === 1 && (r1 === p || r2 === p);
      const h1 = mine(p1);
      const h2 = mine(p2);
      if (h1 && h2) return { cat: HC.TWOPAIR, label: `Two pair, ${RANK_PLURALS[p1].toLowerCase()} and ${RANK_PLURALS[p2].toLowerCase()}`, flags };
      if (h1) return pairLike(p1);
      if (h2) return pairLike(p2);
      return noPair();
    }
    case CAT.PAIR: {
      const p = (v >> 16) & 15;
      if (r1 === r2 && r1 === p) return pocketPair(p);
      if (r1 === p || r2 === p) return pairLike(p);
      return noPair();
    }
    default:
      return noPair();
  }
}

export const isPairedBoard = (board: readonly number[]): boolean => new Set(board.map(rankOf)).size < board.length;

/** Draw strength on the flop/turn: 0 none, ~0.4 gutshot, ~0.75 open-ender, ~0.85 flush draw, 1 combo draw. */
export function drawStrength(board: readonly number[], c1: number, c2: number): number {
  const v = evaluateWith(board, c1, c2);
  const cat = v >> 20;
  if (cat >= CAT.STRAIGHT) return 0;
  let fd = false;
  for (let s = 0; s < 4; s++) {
    const hole = (suitOf(c1) === s ? 1 : 0) + (suitOf(c2) === s ? 1 : 0);
    if (!hole) continue;
    let cnt = hole;
    for (const c of board) if (suitOf(c) === s) cnt++;
    if (cnt === 4) fd = true;
  }
  const bm = boardRankMask(board);
  const hm = bm | (1 << rankOf(c1)) | (1 << rankOf(c2));
  let outs = 0;
  for (let r = 0; r < 13; r++) {
    if (STRAIGHT_HIGH[hm | (1 << r)] >= 0 && STRAIGHT_HIGH[bm | (1 << r)] < 0) outs++;
  }
  const oesd = outs >= 2;
  const gut = outs === 1;
  let d = 0;
  if (fd && (oesd || gut)) d = 1;
  else if (fd) d = 0.85;
  else if (oesd) d = 0.75;
  else if (gut) d = 0.4;
  if (board.length === 3 && cat === CAT.HIGH) {
    const top = Math.max(...board.map(rankOf));
    if (rankOf(c1) > top && rankOf(c2) > top) d = Math.max(d, 0.3);
  }
  return d;
}
