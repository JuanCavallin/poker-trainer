/** XP, levels and titles. Level L needs 60 * L * (L - 1) total XP. */
export const xpForLevel = (level: number): number => 60 * level * (level - 1);

export function levelFromXp(xp: number): { level: number; into: number; span: number } {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  const base = xpForLevel(level);
  return { level, into: xp - base, span: xpForLevel(level + 1) - base };
}

export const TITLES = [
  'Curious Cub',
  'Pocket Pup',
  'Felt Fawn',
  'Chip Chipmunk',
  'River Otter',
  'Clever Crow',
  'Bluff Badger',
  'Range Lynx',
  'Solver Stag',
  'Hearth Bear',
  'Grand Owl',
];

export const titleFor = (level: number): string => TITLES[Math.min(level, TITLES.length) - 1];

export function xpForSpot(score: number, difficulty: number): number {
  return Math.round(8 + score * 0.12 + difficulty * 10);
}

export function chipsForSpot(score: number): number {
  return 2 + (score >= 80 ? 3 : 0) + (score >= 95 ? 2 : 0);
}

export const dayKey = (d = new Date()): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function daysBetween(a: string, b: string): number {
  const pa = new Date(`${a}T12:00:00`);
  const pb = new Date(`${b}T12:00:00`);
  return Math.round((pb.getTime() - pa.getTime()) / 86_400_000);
}
