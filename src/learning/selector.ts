import type { Position } from '../engine/seats';
import type { ProfileId } from '../engine/profiles';
import { randomSeed } from '../engine/rng';
import type { TextureId } from '../engine/texture';
import { STREETS, isPreflopNode, parseFamily, type NodeType, type SpotRequest, type Street } from '../engine/types';
import type { AttemptRecord } from '../state/types';
import { TEXTURES_BY_STREET, familyFitsSeats, unlockedFamilies, unlockedProfiles, type SeatPref } from './families';
import { retrievability, type FamilyState } from './memory';

export interface SelectorInput {
  families: Record<string, FamilyState>;
  level: number;
  unlockAll: boolean;
  /** Most recent first. */
  recent: AttemptRecord[];
  /** Families failed this session, with the session index at which they failed. */
  relearn: { family: string; at: number }[];
  sessionIndex: number;
  now: number;
  /** Streets to train (default: all). */
  streets?: Street[];
  /** Fixed seats, if the player chose them. */
  seats?: SeatPref;
}

export interface Pick {
  request: SpotRequest;
  reason: 'relearn' | 'due' | 'new' | 'weak' | 'mixed';
  relearnFamily?: string;
}

const rand = Math.random;

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + Math.max(0, b), 0);
  let x = rand() * total;
  for (let i = 0; i < items.length; i++) {
    x -= Math.max(0, weights[i]);
    if (x <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** A spot request for one family, keeping any seats the player fixed. */
export function requestForFamily(family: string, profile: ProfileId, seats?: SeatPref): SpotRequest {
  const { street, nodeType, texture } = parseFamily(family);
  const base: SpotRequest = { seed: randomSeed(), street, nodeType, profile };
  if (seats?.villain) base.villainPos = seats.villain;
  if (street === 'preflop') return { ...base, heroPos: texture as Position };
  if (seats?.hero) base.heroPos = seats.hero;
  return { ...base, texture: texture as TextureId };
}

/**
 * Regular mode: interleave due reviews, a trickle of new families, and weak spots, never the same
 * family twice in a row. Missed families come back after a few other spots (spaced re-test).
 * Difficulty drifts toward ~85% success via the villain mix.
 */
export function nextRegular(input: SelectorInput): Pick {
  const { families, level, unlockAll, recent, relearn, sessionIndex, now } = input;
  let unlocked = unlockedFamilies(level, unlockAll, input.streets, input.seats);
  if (!unlocked.length) unlocked = unlockedFamilies(level, true, input.streets, input.seats);
  if (!unlocked.length) unlocked = unlockedFamilies(level, true, input.streets);
  const last = recent[0]?.family;
  const pool = unlocked.length > 1 ? unlocked.filter((f) => f !== last) : unlocked;
  const window = recent.slice(0, 10);
  const success = window.length ? window.filter((r) => r.score >= 70).length / window.length : 0.8;

  let family: string;
  let reason: Pick['reason'];
  const ready = relearn.find((r) => sessionIndex - r.at >= 3 && r.family !== last && pool.includes(r.family));
  const due = pool
    .filter((f) => families[f]?.reps > 0 && retrievability(families[f], now) < 0.9)
    .sort((a, b) => retrievability(families[a], now) - retrievability(families[b], now));
  const unseen = pool.filter((f) => !families[f] || families[f].reps === 0);
  const r = rand();
  if (ready) {
    family = ready.family;
    reason = 'relearn';
  } else if (due.length && r < 0.5) {
    family = due[Math.min(due.length - 1, Math.floor(rand() * Math.min(2, due.length)))];
    reason = 'due';
  } else if (unseen.length && r < 0.72) {
    family = unseen[Math.floor(rand() * unseen.length)];
    reason = 'new';
  } else {
    family = weightedPick(pool, pool.map((f) => 1.25 - (families[f]?.mastery ?? 0.3)));
    reason = 'weak';
  }

  const exploiters = unlockedProfiles(level, unlockAll).filter((p) => p !== 'gto');
  let profile: ProfileId = 'gto';
  const exploitRate = success > 0.88 ? 0.35 : success < 0.65 ? 0.12 : 0.22;
  if (exploiters.length && rand() < exploitRate) profile = exploiters[Math.floor(rand() * exploiters.length)];
  return { request: requestForFamily(family, profile, input.seats), reason, relearnFamily: ready?.family };
}

export interface DrillFilters {
  /** Empty = any street that fits the other filters. */
  streets: Street[];
  nodeTypes: NodeType[];
  textures: TextureId[];
  profiles: ProfileId[];
  heroSeats: Position[];
  villainSeats: Position[];
  potTypes: ('SRP' | '3BP')[];
  order: 'mixed' | 'blocked';
}

export const emptyFilters = (): DrillFilters => ({ streets: [], nodeTypes: [], textures: [], profiles: ['gto'], heroSeats: [], villainSeats: [], potTypes: [], order: 'mixed' });

export function textureStreet(t: TextureId): Street {
  if (t === 'preflop') return 'preflop';
  return t.startsWith('f-') ? 'flop' : t.startsWith('t-') ? 'turn' : 'river';
}

/** Streets a drill can deal, given everything it filters on. */
export function drillStreets(f: DrillFilters): Street[] {
  let streets = f.streets.length ? f.streets : STREETS;
  if (f.nodeTypes.length) {
    const pre = f.nodeTypes.some(isPreflopNode);
    const post = f.nodeTypes.some((n) => !isPreflopNode(n));
    streets = streets.filter((s) => (s === 'preflop' ? pre : post));
  }
  if (f.textures.length) streets = streets.filter((s) => s === 'preflop' || f.textures.some((t) => textureStreet(t) === s));
  if (f.potTypes.includes('3BP') && !f.potTypes.includes('SRP')) streets = streets.filter((s) => s !== 'preflop');
  return streets.length ? streets : f.streets.length ? f.streets : ['river'];
}

/** Drill mode: random within the filters; "blocked" keeps one combination for 4 spots in a row. */
export function nextDrill(filters: DrillFilters, index: number, prev?: SpotRequest): SpotRequest {
  const pick = <T,>(arr: readonly T[]): T | undefined => (arr.length ? arr[Math.floor(rand() * arr.length)] : undefined);
  if (filters.order === 'blocked' && prev && index % 4 !== 0) {
    return { ...prev, seed: randomSeed(), lineSeed: undefined, board: undefined };
  }
  const street = pick(drillStreets(filters))!;
  const nodeType = pick(filters.nodeTypes.filter((n) => isPreflopNode(n) === (street === 'preflop')));
  const texture = street === 'preflop' ? undefined : pick(filters.textures.filter((t) => TEXTURES_BY_STREET[street as 'flop'].includes(t)));
  const heroPos = pick(filters.heroSeats);
  const villainPos = pick(filters.villainSeats.filter((p) => p !== heroPos));
  return {
    seed: randomSeed(),
    street,
    nodeType,
    texture,
    heroPos,
    villainPos,
    potType: street === 'preflop' ? undefined : pick(filters.potTypes),
    profile: pick(filters.profiles) ?? 'gto',
  };
}

export function dueFamilies(families: Record<string, FamilyState>, now: number, streets?: Street[]): string[] {
  return Object.entries(families)
    .filter(([k, f]) => f.reps > 0 && retrievability(f, now) < 0.9 && (!streets || streets.includes(parseFamily(k).street)))
    .sort((a, b) => retrievability(a[1], now) - retrievability(b[1], now))
    .map(([k]) => k);
}

export function nextReview(families: Record<string, FamilyState>, now: number, last?: string, seats?: SeatPref): SpotRequest | null {
  const all = dueFamilies(families, now);
  const fits = all.filter((f) => !seats || familyFitsSeats(f, seats));
  const family = fits.find((f) => f !== last) ?? fits[0] ?? all.find((f) => f !== last) ?? all[0];
  if (!family) return null;
  return requestForFamily(family, 'gto', seats && familyFitsSeats(family, seats) ? seats : undefined);
}

/** A random permutation of the four suits (never the identity). */
export function randomSuitPerm(): number[] {
  for (;;) {
    const p = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    if (p.some((x, i) => x !== i)) return p;
  }
}
