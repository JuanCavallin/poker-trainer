import type { ProfileId } from '../engine/profiles';
import { randomSeed } from '../engine/rng';
import type { TextureId } from '../engine/texture';
import { parseFamily, type NodeType, type SpotRequest } from '../engine/types';
import type { AttemptRecord } from '../state/types';
import { unlockedFamilies, unlockedProfiles } from './families';
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

/**
 * Regular mode: interleave due reviews, a trickle of new families, and weak spots, never the same
 * family twice in a row. Missed families come back after a few other spots (spaced re-test).
 * Difficulty drifts toward ~85% success via the villain mix.
 */
export function nextRegular(input: SelectorInput): Pick {
  const { families, level, unlockAll, recent, relearn, sessionIndex, now } = input;
  const unlocked = unlockedFamilies(level, unlockAll);
  const last = recent[0]?.family;
  const pool = unlocked.length > 1 ? unlocked.filter((f) => f !== last) : unlocked;
  const window = recent.slice(0, 10);
  const success = window.length ? window.filter((r) => r.score >= 70).length / window.length : 0.8;

  let family: string;
  let reason: Pick['reason'];
  const ready = relearn.find((r) => sessionIndex - r.at >= 3 && r.family !== last);
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

  const { nodeType, texture } = parseFamily(family);
  const exploiters = unlockedProfiles(level, unlockAll).filter((p) => p !== 'gto');
  let profile: ProfileId = 'gto';
  const exploitRate = success > 0.88 ? 0.35 : success < 0.65 ? 0.12 : 0.22;
  if (exploiters.length && rand() < exploitRate) profile = exploiters[Math.floor(rand() * exploiters.length)];
  return { request: { seed: randomSeed(), nodeType, texture, profile }, reason, relearnFamily: ready?.family };
}

export interface DrillFilters {
  nodeTypes: NodeType[];
  textures: TextureId[];
  profiles: ProfileId[];
  scenarios: string[];
  order: 'mixed' | 'blocked';
}

/** Drill mode: random within the filters; "blocked" keeps one combination for 4 spots in a row. */
export function nextDrill(filters: DrillFilters, index: number, prev?: SpotRequest): SpotRequest {
  const pick = <T,>(arr: T[]): T | undefined => (arr.length ? arr[Math.floor(rand() * arr.length)] : undefined);
  if (filters.order === 'blocked' && prev && index % 4 !== 0) {
    return { ...prev, seed: randomSeed() };
  }
  return {
    seed: randomSeed(),
    nodeType: pick(filters.nodeTypes),
    texture: pick(filters.textures),
    profile: pick(filters.profiles) ?? 'gto',
    scenarioId: pick(filters.scenarios),
  };
}

export function dueFamilies(families: Record<string, FamilyState>, now: number): string[] {
  return Object.entries(families)
    .filter(([, f]) => f.reps > 0 && retrievability(f, now) < 0.9)
    .sort((a, b) => retrievability(a[1], now) - retrievability(b[1], now))
    .map(([k]) => k);
}

export function nextReview(families: Record<string, FamilyState>, now: number, last?: string): SpotRequest | null {
  const due = dueFamilies(families, now).filter((f) => f !== last);
  const family = due[0] ?? dueFamilies(families, now)[0];
  if (!family) return null;
  const { nodeType, texture } = parseFamily(family);
  return { seed: randomSeed(), nodeType, texture, profile: 'gto' };
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
