/**
 * Per-family memory model, in the spirit of SM-2/FSRS: each family has a stability (days until
 * recall probability falls to 90%). Good reviews stretch the interval; failures shrink it and put
 * the family on a short in-session relearning loop.
 */
export const DAY = 86_400_000;

export interface FamilyState {
  reps: number;
  lapses: number;
  /** Days until retrievability hits 90%. */
  stability: number;
  last: number;
  due: number;
  /** Exponential moving average of scores, 0..1. */
  mastery: number;
  best: number;
  /** Moving average decision time in ms. */
  avgMs: number;
  recent: number[];
}

export const newFamily = (): FamilyState => ({ reps: 0, lapses: 0, stability: 0.5, last: 0, due: 0, mastery: 0, best: 0, avgMs: 0, recent: [] });

export function retrievability(f: FamilyState | undefined, now: number): number {
  if (!f || f.reps === 0) return 0;
  return Math.pow(0.9, (now - f.last) / (f.stability * DAY));
}

export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

export function gradeFor(score: number, ms: number, avgMs: number): ReviewGrade {
  if (score < 55) return 'again';
  if (score < 72) return 'hard';
  if (score >= 88 && (avgMs === 0 || ms <= avgMs * 1.1)) return 'easy';
  return 'good';
}

export function reviewFamily(prev: FamilyState | undefined, score: number, ms: number, now: number): { state: FamilyState; grade: ReviewGrade } {
  const f = prev ? { ...prev, recent: [...prev.recent] } : newFamily();
  const grade = gradeFor(score, ms, f.avgMs);
  // Reviewing before the item is due grows stability less (spacing effect).
  const r = retrievability(prev, now);
  const spacingBonus = f.reps === 0 ? 1 : 1 + 0.6 * (1 - r);
  if (grade === 'again') {
    f.lapses += 1;
    f.stability = Math.max(0.12, f.stability * 0.35);
  } else if (grade === 'hard') f.stability = f.stability * 1.15 * spacingBonus;
  else if (grade === 'good') f.stability = f.stability * 2.1 * spacingBonus;
  else f.stability = f.stability * 2.9 * spacingBonus;
  f.stability = Math.min(f.stability, 120);
  f.reps += 1;
  f.last = now;
  f.due = now + f.stability * DAY;
  f.mastery = f.reps === 1 ? (score / 100) * 0.7 : 0.72 * f.mastery + 0.28 * (score / 100);
  f.best = Math.max(f.best, score);
  f.avgMs = f.avgMs === 0 ? ms : 0.8 * f.avgMs + 0.2 * ms;
  f.recent.push(score);
  if (f.recent.length > 12) f.recent.shift();
  return { state: f, grade };
}

/** Plant growth: 0 seed, 1 sprout, 2 leafy, 3 blooming, 4 golden. */
export function plantStage(f: FamilyState | undefined): number {
  if (!f || f.reps === 0) return 0;
  if (f.reps >= 10 && f.mastery >= 0.85 && f.stability >= 7) return 4;
  if (f.reps >= 6 && f.mastery >= 0.72) return 3;
  if (f.reps >= 3 && f.mastery >= 0.55) return 2;
  return 1;
}

export const STAGE_NAMES = ['Seed', 'Sprout', 'Leafy', 'Blooming', 'Golden'];
