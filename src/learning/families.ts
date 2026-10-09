import { TEXTURES, TEXTURE_IDS, type TextureId } from '../engine/texture';
import { NODE_TYPES, NODE_TYPE_INFO, familyKey, parseFamily, type NodeType } from '../engine/types';
import { PROFILES, PROFILE_IDS, type ProfileId } from '../engine/profiles';

/** Spot "families" are the unit of spaced repetition: a decision type on a board texture. */
export const TEXTURE_UNLOCK: Record<TextureId, number> = { dry: 1, paired: 1, connected: 2, flushy: 3, 'flush-river': 4, 'straight-river': 5 };
export const NODE_UNLOCK: Record<NodeType, number> = { 'ip-vs-check': 1, 'ip-vs-bet': 1, 'oop-vs-bet': 2, 'oop-first': 3 };

export const ALL_FAMILIES: string[] = NODE_TYPES.flatMap((n) => TEXTURE_IDS.map((t) => familyKey(n, t)));

export function familyUnlockLevel(key: string): number {
  const { nodeType, texture } = parseFamily(key);
  return Math.max(NODE_UNLOCK[nodeType], TEXTURE_UNLOCK[texture]);
}

export function familyLabel(key: string): { node: string; texture: string; full: string } {
  const { nodeType, texture } = parseFamily(key);
  const node = NODE_TYPE_INFO[nodeType].short;
  const tex = TEXTURES[texture].label;
  return { node, texture: tex, full: `${node} · ${tex}` };
}

export function unlockedProfiles(level: number, unlockAll: boolean): ProfileId[] {
  return PROFILE_IDS.filter((p) => unlockAll || PROFILES[p].unlock <= level);
}

export function unlockedFamilies(level: number, unlockAll: boolean): string[] {
  return ALL_FAMILIES.filter((f) => unlockAll || familyUnlockLevel(f) <= level);
}
