import { RANKS, SUITS, makeCard } from './cards';
import { NUM_COMBOS, classCombos, classOf, comboC1, comboC2, comboId } from './combos';

/** A range is a weight in [0, 1] for each of the 1326 combos. */
export type Range = Float32Array;

export const emptyRange = (): Range => new Float32Array(NUM_COMBOS);

const rankIdx = (ch: string): number => {
  const r = RANKS.indexOf(ch.toUpperCase());
  if (r < 0) throw new Error(`Bad rank: ${ch}`);
  return r;
};

/** Combos of a class given ranks (0 = deuce) and kind. */
function combosFor(hi: number, lo: number, kind: 's' | 'o' | ''): number[] {
  if (hi === lo) return classCombos[classOf(12 - hi, 12 - hi)];
  const suited = classCombos[classOf(12 - hi, 12 - lo)];
  const offsuit = classCombos[classOf(12 - lo, 12 - hi)];
  if (kind === 's') return suited;
  if (kind === 'o') return offsuit;
  return [...suited, ...offsuit];
}

function parseHand(tok: string): { hi: number; lo: number; kind: 's' | 'o' | '' } {
  const a = rankIdx(tok[0]);
  const b = rankIdx(tok[1]);
  const kindCh = (tok[2] ?? '').toLowerCase();
  const kind = kindCh === 's' || kindCh === 'o' ? kindCh : '';
  return { hi: Math.max(a, b), lo: Math.min(a, b), kind };
}

/** Expands one token ("AKs", "TT+", "A5s-A2s", "KQo", "AsKs") into combo ids. */
export function expandToken(tok: string): number[] {
  if (/^[2-9TJQKA][cdhs][2-9TJQKA][cdhs]$/i.test(tok)) {
    const c1 = makeCard(rankIdx(tok[0]), SUITS.indexOf(tok[1].toLowerCase()));
    const c2 = makeCard(rankIdx(tok[2]), SUITS.indexOf(tok[3].toLowerCase()));
    return c1 === c2 ? [] : [comboId(c1, c2)];
  }
  if (tok.includes('-')) {
    const [from, to] = tok.split('-');
    const a = parseHand(from);
    const b = parseHand(to);
    const out: number[] = [];
    if (a.hi === a.lo) {
      const top = Math.max(a.hi, b.hi);
      const bottom = Math.min(a.hi, b.hi);
      for (let r = bottom; r <= top; r++) out.push(...combosFor(r, r, ''));
      return out;
    }
    const top = Math.max(a.lo, b.lo);
    const bottom = Math.min(a.lo, b.lo);
    for (let r = bottom; r <= top; r++) out.push(...combosFor(a.hi, r, a.kind));
    return out;
  }
  if (tok.endsWith('+')) {
    const h = parseHand(tok.slice(0, -1));
    const out: number[] = [];
    if (h.hi === h.lo) {
      for (let r = h.hi; r <= 12; r++) out.push(...combosFor(r, r, ''));
    } else {
      for (let r = h.lo; r < h.hi; r++) out.push(...combosFor(h.hi, r, h.kind));
    }
    return out;
  }
  const h = parseHand(tok);
  return combosFor(h.hi, h.lo, h.kind);
}

/**
 * Parses a range string such as "22+, A2s+, KTo+, A5s-A2s:0.5".
 * Later tokens overwrite earlier ones, so "AA-22, TT:0.5" gives tens half weight.
 */
export function parseRange(text: string): Range {
  const r = emptyRange();
  for (const raw of text.split(/[,\s]+/)) {
    if (!raw) continue;
    const [tok, w] = raw.split(':');
    const weight = w !== undefined ? Number(w) : 1;
    if (!Number.isFinite(weight)) throw new Error(`Bad weight in ${raw}`);
    for (const id of expandToken(tok)) r[id] = weight;
  }
  return r;
}

/** Zeroes combos that contain any dead card. */
export function removeDead(range: Range, dead: readonly number[]): Range {
  const out = new Float32Array(range);
  for (let i = 0; i < NUM_COMBOS; i++) {
    if (out[i] === 0) continue;
    const a = comboC1[i];
    const b = comboC2[i];
    for (const d of dead) {
      if (d === a || d === b) {
        out[i] = 0;
        break;
      }
    }
  }
  return out;
}

export function rangeCombos(range: Range): number {
  let s = 0;
  for (let i = 0; i < NUM_COMBOS; i++) s += range[i];
  return s;
}
