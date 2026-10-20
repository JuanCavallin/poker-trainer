import { rankOf, suitOf } from './cards';
import type { Position } from './seats';
import type { SpotPackage, SpotRequest } from './types';

const permuteCard = (c: number, perm: number[]): number => rankOf(c) * 4 + perm[suitOf(c)];

/**
 * A request that regenerates exactly this spot (same seats, board and line), with `patch` applied.
 * Cards in `patch` are given as displayed: undone through the spot's suit permutation, if any.
 */
export function sameSpotRequest(spot: SpotPackage, patch: Partial<SpotRequest> = {}): SpotRequest {
  const perm = spot.request.suitPerm;
  const inv = perm ? perm.map((_, s) => perm.indexOf(s)) : null;
  const raw = (c: number) => (inv ? permuteCard(c, inv) : c);
  const next = patch.nextCard ?? spot.nextCard;
  return {
    ...spot.request,
    street: spot.street,
    nodeType: spot.nodeType,
    heroPos: spot.heroPos as Position,
    villainPos: spot.villainPos as Position,
    potType: spot.scenario.potType === '3BP' ? '3BP' : 'SRP',
    lineSeed: spot.lineSeed,
    villainFrac: spot.villainAction.frac || undefined,
    keepLine: true,
    ...patch,
    board: (patch.board ?? spot.board).map(raw),
    nextCard: next != null ? raw(next) : undefined,
  };
}
