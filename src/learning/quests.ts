import { Rng, hash32 } from '../engine/rng';
import type { AttemptRecord, Quest, QuestKind } from '../state/types';

interface QuestTemplate {
  kind: QuestKind;
  emoji: string;
  label: (n: number) => string;
  targets: number[];
  xp: number;
  chips: number;
  minLevel?: number;
}

const TEMPLATES: QuestTemplate[] = [
  { kind: 'spots', emoji: '🃏', label: (n) => `Play ${n} spots`, targets: [5, 6, 8], xp: 40, chips: 15 },
  { kind: 'score80', emoji: '⭐', label: (n) => `Score 80+ on ${n} ranges`, targets: [2, 3, 4], xp: 50, chips: 20 },
  { kind: 'find', emoji: '🔎', label: () => 'Make a highlight play (hero call, brave bluff, thin value...)', targets: [1], xp: 50, chips: 20 },
  { kind: 'review', emoji: '💧', label: (n) => `Water ${n} thirsty plants (reviews)`, targets: [2, 3], xp: 45, chips: 20 },
  { kind: 'blitz', emoji: '⚡', label: () => 'Finish a Blitz run', targets: [1], xp: 40, chips: 15 },
  { kind: 'villain', emoji: '🦊', label: (n) => `Play ${n} spots against an exploitable villain`, targets: [2, 3], xp: 50, chips: 20, minLevel: 4 },
  { kind: 'facing', emoji: '🛡️', label: (n) => `Defend against ${n} river bets`, targets: [3, 4], xp: 40, chips: 15 },
  { kind: 'balance', emoji: '⚖️', label: (n) => `Bluff within 5 points of the solver ratio ${n} times`, targets: [2], xp: 55, chips: 25 },
  { kind: 'perfect-hand', emoji: '🎯', label: (n) => `Play ${n} hands rated Perfect`, targets: [3, 4], xp: 40, chips: 15 },
];

export function makeDailyQuests(day: string, level: number, hasDue: boolean): Quest[] {
  const rng = new Rng(hash32(...[...day].map((c) => c.charCodeAt(0))));
  const pool = TEMPLATES.filter((t) => (t.minLevel ?? 1) <= level && (t.kind !== 'review' || hasDue));
  const picked: QuestTemplate[] = [];
  // Always one volume quest, then two different others.
  picked.push(pool.find((t) => t.kind === 'spots')!);
  const rest = rng.shuffle(pool.filter((t) => t.kind !== 'spots'));
  for (const t of rest) {
    if (picked.length >= 3) break;
    picked.push(t);
  }
  return picked.map((t, i) => {
    const target = rng.pick(t.targets);
    return { id: `${day}-${i}-${t.kind}`, kind: t.kind, emoji: t.emoji, label: t.label(target), target, progress: 0, xp: t.xp, chips: t.chips, claimed: false };
  });
}

export type QuestEvent = { type: 'attempt'; rec: AttemptRecord; balanceHit: boolean } | { type: 'blitz' };

export function questIncrement(q: Quest, ev: QuestEvent): number {
  if (ev.type === 'blitz') return q.kind === 'blitz' ? 1 : 0;
  const r = ev.rec;
  switch (q.kind) {
    case 'spots':
      return 1;
    case 'score80':
      return r.score >= 80 ? 1 : 0;
    case 'find':
      return r.finds.length > 0 ? 1 : 0;
    case 'review':
      return r.kind === 'review' ? 1 : 0;
    case 'villain':
      return r.profile !== 'gto' ? 1 : 0;
    case 'facing':
      return r.nodeType === 'ip-vs-bet' || r.nodeType === 'oop-vs-bet' ? 1 : 0;
    case 'balance':
      return ev.balanceHit ? 1 : 0;
    case 'perfect-hand':
      return r.hand.grade === 'Perfect' ? 1 : 0;
    default:
      return 0;
  }
}

export const QUEST_BONUS = { xp: 60, chips: 40 };
