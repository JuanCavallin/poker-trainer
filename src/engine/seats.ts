/** 6-max seats and who acts first, kept apart from the preflop solution data so the UI can import it cheaply. */
export type Position = 'UTG' | 'HJ' | 'CO' | 'BTN' | 'SB' | 'BB';
export const POSITIONS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const OPENERS: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB'];
export const POSITION_NAMES: Record<Position, string> = {
  UTG: 'Under the gun',
  HJ: 'Hijack',
  CO: 'Cutoff',
  BTN: 'Button',
  SB: 'Small blind',
  BB: 'Big blind',
};
export const PRE_ORDER: Record<Position, number> = { UTG: 0, HJ: 1, CO: 2, BTN: 3, SB: 4, BB: 5 };
/** Postflop acting order: lower acts first (is out of position). */
export const POST_ORDER: Record<Position, number> = { SB: 0, BB: 1, UTG: 2, HJ: 3, CO: 4, BTN: 5 };

export const isEarlier = (a: Position, b: Position): boolean => PRE_ORDER[a] < PRE_ORDER[b];
export const respondersAfter = (o: Position): Position[] => POSITIONS.filter((p) => PRE_ORDER[p] > PRE_ORDER[o]);
export const openersBefore = (r: Position): Position[] => OPENERS.filter((p) => PRE_ORDER[p] < PRE_ORDER[r]);
/** Postflop: is `a` out of position against `b`? */
export const isOopVs = (a: Position, b: Position): boolean => POST_ORDER[a] < POST_ORDER[b];
