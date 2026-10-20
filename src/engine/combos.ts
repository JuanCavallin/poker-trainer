import { RANKS, cardPretty, cardStr, rankOf, suitOf, type Card } from './cards';

/** All 1326 two-card combos. comboC1 holds the higher card. */
export const NUM_COMBOS = 1326;
export const NUM_CLASSES = 169;
export const comboC1 = new Uint8Array(NUM_COMBOS);
export const comboC2 = new Uint8Array(NUM_COMBOS);
const comboIdx = new Int16Array(52 * 52).fill(-1);

/** Grid class (0..168) of each combo: row/col 0 = ace ... 12 = deuce. */
export const comboClass = new Uint8Array(NUM_COMBOS);
export const classCombos: number[][] = Array.from({ length: NUM_CLASSES }, () => []);

{
  let k = 0;
  for (let a = 1; a < 52; a++) {
    for (let b = 0; b < a; b++) {
      comboC1[k] = a;
      comboC2[k] = b;
      comboIdx[a * 52 + b] = k;
      comboIdx[b * 52 + a] = k;
      const r1 = rankOf(a);
      const r2 = rankOf(b);
      let row: number;
      let col: number;
      if (r1 === r2) {
        row = col = 12 - r1;
      } else if (suitOf(a) === suitOf(b)) {
        row = 12 - r1;
        col = 12 - r2;
      } else {
        row = 12 - r2;
        col = 12 - r1;
      }
      const cls = row * 13 + col;
      comboClass[k] = cls;
      classCombos[cls].push(k);
      k++;
    }
  }
}

export const comboId = (a: Card, b: Card): number => comboIdx[a * 52 + b];

export const comboHas = (id: number, card: Card): boolean => comboC1[id] === card || comboC2[id] === card;

export const comboStr = (id: number): string => cardStr(comboC1[id]) + cardStr(comboC2[id]);
export const comboPretty = (id: number): string => cardPretty(comboC1[id]) + cardPretty(comboC2[id]);

export const comboBlocked = (id: number, dead: readonly Card[]): boolean => {
  const a = comboC1[id];
  const b = comboC2[id];
  for (const d of dead) if (d === a || d === b) return true;
  return false;
};

export type ClassKind = 'pair' | 'suited' | 'offsuit';

export function classKind(cls: number): ClassKind {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return 'pair';
  return row < col ? 'suited' : 'offsuit';
}

export function classLabel(cls: number): string {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  if (row === col) return RANKS[12 - row] + RANKS[12 - row];
  if (row < col) return RANKS[12 - row] + RANKS[12 - col] + 's';
  return RANKS[12 - col] + RANKS[12 - row] + 'o';
}

export const classOf = (row: number, col: number): number => row * 13 + col;

/** Ranks (high, low) of a class, using 0 = deuce. */
export function classRanks(cls: number): [number, number] {
  const row = Math.floor(cls / 13);
  const col = cls % 13;
  const a = 12 - row;
  const b = 12 - col;
  return a >= b ? [a, b] : [b, a];
}
