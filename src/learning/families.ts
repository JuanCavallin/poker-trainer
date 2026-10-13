import { isEarlier, isOopVs, type Position } from '../engine/seats';
import { PROFILES, PROFILE_IDS, type ProfileId } from '../engine/profiles';
import { FLOP_TEXTURE_IDS, TEXTURES, TEXTURE_IDS, TURN_TEXTURE_IDS, type TextureId } from '../engine/texture';
import { NODE_TYPES, NODE_TYPE_INFO, PREFLOP_NODE_TYPES, STREET_LABEL, familyKey, parseFamily, type NodeType, type PreflopNode, type SpotRequest, type Street } from '../engine/types';

/**
 * Spot "families" are the unit of spaced repetition: a decision type on a board texture (postflop)
 * or a decision type from a seat (preflop).
 */
export const TEXTURE_UNLOCK: Record<TextureId, number> = {
  dry: 1,
  paired: 1,
  connected: 2,
  flushy: 3,
  'flush-river': 4,
  'straight-river': 5,
  'f-dry': 1,
  'f-paired': 1,
  'f-twotone': 2,
  'f-connected': 3,
  'f-monotone': 4,
  't-blank': 1,
  't-overcard': 2,
  't-paired': 2,
  't-flush': 4,
  't-straight': 5,
  preflop: 1,
};
export const NODE_UNLOCK: Record<NodeType, number> = { 'ip-vs-check': 1, 'ip-vs-bet': 1, 'oop-vs-bet': 2, 'oop-first': 3, rfi: 1, 'vs-open': 1, 'vs-3bet': 2, 'vs-4bet': 4 };
export const STREET_UNLOCK: Record<Street, number> = { preflop: 1, flop: 1, turn: 2, river: 1 };

/** Seats from which each preflop decision can happen. */
export const PREFLOP_SEATS: Record<PreflopNode, Position[]> = {
  rfi: ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
  'vs-open': ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  'vs-3bet': ['UTG', 'HJ', 'CO', 'BTN', 'SB'],
  'vs-4bet': ['HJ', 'CO', 'BTN', 'SB', 'BB'],
};

export const TEXTURES_BY_STREET: Record<'flop' | 'turn' | 'river', TextureId[]> = { flop: FLOP_TEXTURE_IDS, turn: TURN_TEXTURE_IDS, river: TEXTURE_IDS };

/** Column keys for a street: textures postflop, seats preflop. */
export function columnsFor(street: Street): string[] {
  return street === 'preflop' ? ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'] : TEXTURES_BY_STREET[street];
}

export function familiesFor(street: Street): string[] {
  if (street === 'preflop') return PREFLOP_NODE_TYPES.flatMap((n) => PREFLOP_SEATS[n].map((p) => familyKey('preflop', n, p)));
  return NODE_TYPES.flatMap((n) => TEXTURES_BY_STREET[street].map((t) => familyKey(street, n, t)));
}

export const ALL_FAMILIES: string[] = (['preflop', 'flop', 'turn', 'river'] as Street[]).flatMap(familiesFor);

export function familyUnlockLevel(key: string): number {
  const { street, nodeType, texture } = parseFamily(key);
  const tex = street === 'preflop' ? 1 : (TEXTURE_UNLOCK[texture as TextureId] ?? 1);
  return Math.max(NODE_UNLOCK[nodeType] ?? 1, tex, STREET_UNLOCK[street]);
}

export function columnLabel(street: Street, col: string): string {
  return street === 'preflop' ? col : (TEXTURES[col as TextureId]?.label ?? col);
}

export function familyLabel(key: string): { street: string; node: string; texture: string; full: string } {
  const { street, nodeType, texture } = parseFamily(key);
  const node = NODE_TYPE_INFO[nodeType]?.short ?? nodeType;
  const tex = street === 'preflop' ? `from ${texture}` : (TEXTURES[texture as TextureId]?.label ?? texture);
  return { street: STREET_LABEL[street], node, texture: tex, full: `${STREET_LABEL[street]} · ${node} · ${tex}` };
}

const SEAT_HUE: Record<string, number> = { UTG: 20, HJ: 35, CO: 55, BTN: 75, SB: 280, BB: 300 };

/** Plant colour for a family: its texture's hue, or a seat colour preflop. */
export function familyHue(key: string): number {
  const { street, texture } = parseFamily(key);
  return street === 'preflop' ? (SEAT_HUE[texture] ?? 30) : (TEXTURES[texture as TextureId]?.hue ?? 30);
}

export function unlockedProfiles(level: number, unlockAll: boolean): ProfileId[] {
  return PROFILE_IDS.filter((p) => unlockAll || PROFILES[p].unlock <= level);
}

export type Focus = 'all' | 'preflop' | 'postflop';
export const focusStreets = (focus: Focus): Street[] => (focus === 'preflop' ? ['preflop'] : focus === 'postflop' ? ['flop', 'turn', 'river'] : ['preflop', 'flop', 'turn', 'river']);

export interface SeatPref {
  hero?: Position;
  villain?: Position;
}

/** Seats fixed in settings ('any' = random). */
export function seatPref(settings: { heroSeat?: Position | 'any'; villainSeat?: Position | 'any' }): SeatPref | undefined {
  const hero = settings.heroSeat && settings.heroSeat !== 'any' ? settings.heroSeat : undefined;
  const villain = settings.villainSeat && settings.villainSeat !== 'any' && settings.villainSeat !== hero ? settings.villainSeat : undefined;
  return hero || villain ? { hero, villain } : undefined;
}

/** Can this family be dealt with the chosen seats? */
export function familyFitsSeats(key: string, seats: SeatPref): boolean {
  const { street, nodeType, texture } = parseFamily(key);
  if (seats.hero && seats.villain && seats.hero === seats.villain) return true;
  if (street === 'preflop') {
    if (seats.hero && texture !== seats.hero) return false;
    const hero = (seats.hero ?? texture) as Position;
    if (!seats.villain) return true;
    const opens = nodeType === 'rfi' || nodeType === 'vs-3bet';
    return isEarlier(hero, seats.villain) === opens;
  }
  if (seats.hero && seats.villain) return isOopVs(seats.hero, seats.villain) === nodeType.startsWith('oop');
  if (seats.hero === 'BTN') return nodeType.startsWith('ip');
  if (seats.villain === 'BTN') return nodeType.startsWith('oop');
  if (seats.hero === 'SB') return nodeType.startsWith('oop');
  if (seats.villain === 'SB') return nodeType.startsWith('ip');
  return true;
}

export function unlockedFamilies(level: number, unlockAll: boolean, streets?: Street[], seats?: SeatPref): string[] {
  return ALL_FAMILIES.filter(
    (f) => (unlockAll || familyUnlockLevel(f) <= level) && (!streets || streets.includes(parseFamily(f).street)) && (!seats || familyFitsSeats(f, seats)),
  );
}

/** The family a request was built for (selector requests always name one). */
export function requestFamily(req: SpotRequest): string | null {
  const street = req.street ?? 'river';
  if (!req.nodeType) return null;
  const col = street === 'preflop' ? req.heroPos : req.texture;
  return col ? familyKey(street, req.nodeType, col) : null;
}
