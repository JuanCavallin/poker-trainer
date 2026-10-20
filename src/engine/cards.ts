/**
 * Card encoding: card = rank * 4 + suit, rank 0 = deuce ... 12 = ace, suit 0..3 = c d h s.
 */
export type Card = number;

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
export const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
export const RANK_WORDS = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
export const RANK_PLURALS = ['Deuces', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];

export const rankOf = (c: Card): number => c >> 2;
export const suitOf = (c: Card): number => c & 3;
export const makeCard = (rank: number, suit: number): Card => (rank << 2) | suit;

export function parseCard(s: string): Card {
  const r = RANKS.indexOf(s[0]?.toUpperCase() ?? '');
  const su = SUITS.indexOf(s[1]?.toLowerCase() ?? '');
  if (r < 0 || su < 0) throw new Error(`Bad card: ${s}`);
  return makeCard(r, su);
}

/** Parses "AsKd7c" or "As Kd 7c". */
export function parseCards(s: string): Card[] {
  const clean = s.replace(/[\s,]/g, '');
  const out: Card[] = [];
  for (let i = 0; i < clean.length; i += 2) out.push(parseCard(clean.slice(i, i + 2)));
  return out;
}

export const cardStr = (c: Card): string => RANKS[rankOf(c)] + SUITS[suitOf(c)];
export const rankChar = (r: number): string => RANKS[r];
export const cardPretty = (c: Card): string => RANKS[rankOf(c)] + SUIT_SYMBOLS[suitOf(c)];

export function cardsMask(cards: readonly Card[]): bigint {
  let m = 0n;
  for (const c of cards) m |= 1n << BigInt(c);
  return m;
}
