import type { TreeNode } from './tree';

export type ProfileId = 'gto' | 'station' | 'nit' | 'fox' | 'maniac';

export interface Profile {
  id: ProfileId;
  name: string;
  emoji: string;
  style: string;
  blurb: string;
  exploit: string;
  /** Unlock level in regular mode. */
  unlock: number;
}

export const PROFILES: Record<ProfileId, Profile> = {
  gto: {
    id: 'gto',
    name: 'Wise Owl',
    emoji: '🦉',
    style: 'Balanced',
    blurb: 'Plays the equilibrium. There is nothing to exploit, so solid fundamentals win.',
    exploit: 'Play balanced: bluff in the right ratio and defend close to MDF.',
    unlock: 1,
  },
  station: {
    id: 'station',
    name: 'Sticky Sloth',
    emoji: '🦥',
    style: 'Calling station',
    blurb: 'Hates folding and rarely raises. Will pay you off with second pair.',
    exploit: 'Value bet thinner and bigger. Bluff much less.',
    unlock: 4,
  },
  nit: {
    id: 'nit',
    name: 'Timid Bunny',
    emoji: '🐰',
    style: 'Nit',
    blurb: 'Folds too often and only bets real hands.',
    exploit: 'Bluff more. When the bunny bets, believe it and fold more.',
    unlock: 5,
  },
  fox: {
    id: 'fox',
    name: 'Sly Fox',
    emoji: '🦊',
    style: 'Over-bluffer',
    blurb: 'Fires too many bluffs when given the chance.',
    exploit: 'Call down wider with bluff-catchers. Let the fox bluff.',
    unlock: 6,
  },
  maniac: {
    id: 'maniac',
    name: 'Wild Raccoon',
    emoji: '🦝',
    style: 'Maniac',
    blurb: 'Bets and raises constantly, with and without a hand.',
    exploit: 'Call down lighter, check strong hands to let them bet, bluff less.',
    unlock: 7,
  },
};

export const PROFILE_IDS: ProfileId[] = ['gto', 'station', 'nit', 'fox', 'maniac'];

/**
 * Shifts the villain's equilibrium strategy at one node toward a human tendency.
 * `pct` is each villain hand's strength percentile (vs the hero's range there).
 * Strategy layout: nA x nP, action-major.
 */
export function perturb(profile: ProfileId, node: TreeNode, sigma: Float64Array, pct: Float64Array, riverPot: number): Float64Array {
  if (profile === 'gto') return sigma;
  const nP = pct.length;
  // Size of the bet being faced, relative to the pot before it, so tendencies fade against huge bets.
  const toCall = Math.max(0, node.inv[1 - node.player] - node.inv[node.player]);
  const potBefore = riverPot + node.inv[0] + node.inv[1] - toCall;
  const faced = potBefore > 0 ? toCall / potBefore : 0;
  const out = Float64Array.from(sigma);
  const kinds = node.actions.map((a) => a.kind);
  const facingBet = kinds.includes('fold');
  const at = (a: number, i: number) => a * nP + i;
  const move = (i: number, from: number[], to: number[], share: number) => {
    if (!to.length || !from.length) return;
    let moved = 0;
    for (const a of from) {
      const m = out[at(a, i)] * share;
      out[at(a, i)] -= m;
      moved += m;
    }
    // Spread proportionally to the existing target mass, or evenly if empty.
    let base = 0;
    for (const a of to) base += out[at(a, i)];
    for (const a of to) out[at(a, i)] += base > 1e-9 ? (moved * out[at(a, i)]) / base : moved / to.length;
  };
  const idx = (pred: (k: string, a: number) => boolean) => kinds.map((k, a) => (pred(k, a) ? a : -1)).filter((a) => a >= 0);

  if (!facingBet) {
    const check = idx((k) => k === 'check');
    const bets = idx((k) => k === 'bet' || k === 'allin');
    const big = bets.length ? [bets[bets.length > 1 ? bets.length - 2 : 0]] : [];
    for (let i = 0; i < nP; i++) {
      const p = pct[i];
      if (profile === 'fox' && p < 0.42) move(i, check, big, 0.7);
      if (profile === 'maniac') move(i, check, bets, p < 0.35 || p > 0.7 ? 0.6 : 0.35);
      if (profile === 'nit' && p < 0.62) move(i, bets, check, 0.85);
      if (profile === 'station' && p < 0.8) move(i, bets, check, 0.5);
    }
  } else {
    const fold = idx((k) => k === 'fold');
    const call = idx((k) => k === 'call');
    const raises = idx((k) => k === 'raise' || k === 'allin');
    const stickiness = Math.min(0.8, Math.max(0.25, 0.8 - 0.3 * (faced - 0.33)));
    const timidity = 0.45 + 0.15 * Math.min(faced, 2);
    for (let i = 0; i < nP; i++) {
      const p = pct[i];
      if (profile === 'station') {
        move(i, fold, call, p < 0.08 ? stickiness * 0.4 : stickiness);
        move(i, raises, call, 0.6);
      }
      if (profile === 'nit') {
        if (p < 0.7) move(i, call, fold, timidity);
        if (p < 0.9) move(i, raises, call, 0.8);
      }
      if (profile === 'maniac') {
        if (p < 0.3) move(i, fold, raises, 0.35);
        else move(i, fold, call, 0.35);
      }
      if (profile === 'fox' && p < 0.25) move(i, fold, raises, 0.15);
    }
  }
  return out;
}
