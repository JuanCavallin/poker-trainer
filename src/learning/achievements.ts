import type { PersistedState } from '../state/types';
import { plantStage } from './memory';

export interface AchievementDef {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  target: number;
  value: (s: PersistedState) => number;
  chips: number;
}

const finds = (s: PersistedState, id: keyof PersistedState['counters']['finds']) => s.counters.finds[id] ?? 0;
const plantsAtLeast = (s: PersistedState, stage: number) => Object.values(s.families).filter((f) => plantStage(f) >= stage).length;

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-spot', name: 'Pull Up a Chair', emoji: '🪑', desc: 'Finish your first spot.', target: 1, value: (s) => s.counters.spots, chips: 20 },
  { id: 'spots-25', name: 'Regular', emoji: '☕', desc: 'Finish 25 spots.', target: 25, value: (s) => s.counters.spots, chips: 40 },
  { id: 'spots-100', name: 'Den Dweller', emoji: '🏡', desc: 'Finish 100 spots.', target: 100, value: (s) => s.counters.spots, chips: 80 },
  { id: 'spots-500', name: 'Range Hermit', emoji: '🧙', desc: 'Finish 500 spots.', target: 500, value: (s) => s.counters.spots, chips: 200 },
  { id: 'great-10', name: 'Three-Star Chef', emoji: '👩‍🍳', desc: 'Score 90+ on ten ranges.', target: 10, value: (s) => s.counters.great, chips: 60 },
  { id: 'hero-call-5', name: 'Hero of the River', emoji: '🦸', desc: 'Make five correct hero calls.', target: 5, value: (s) => finds(s, 'hero-call'), chips: 60 },
  { id: 'bluff-5', name: 'Lionheart', emoji: '🦁', desc: 'Fire five correct big bluffs.', target: 5, value: (s) => finds(s, 'brave-bluff') + finds(s, 'bluff-raise'), chips: 60 },
  { id: 'thin-5', name: 'Thin Ice', emoji: '🔪', desc: 'Find five thin value bets.', target: 5, value: (s) => finds(s, 'thin-value'), chips: 60 },
  { id: 'fold-5', name: 'Zen Fold', emoji: '🧘', desc: 'Make five correct big laydowns.', target: 5, value: (s) => finds(s, 'big-fold'), chips: 60 },
  { id: 'blocker-3', name: 'Key Holder', emoji: '🔑', desc: 'Pick three bluffs with the right blockers.', target: 3, value: (s) => finds(s, 'blocker-bluff'), chips: 60 },
  { id: 'trap-3', name: 'Mousetrap', emoji: '🪤', desc: 'Set three traps by checking a monster.', target: 3, value: (s) => finds(s, 'trap'), chips: 50 },
  { id: 'exploit-10', name: "Zookeeper's Notes", emoji: '📓', desc: 'Exploit a villain correctly ten times.', target: 10, value: (s) => finds(s, 'exploit'), chips: 80 },
  { id: 'villains-4', name: 'Met the Whole Zoo', emoji: '🐾', desc: 'Play against all four exploitable villains.', target: 4, value: (s) => s.counters.villains.length, chips: 50 },
  { id: 'mdf-10', name: 'MDF Monk', emoji: '🛡️', desc: 'Defend within 5 points of the solver in ten facing-bet spots.', target: 10, value: (s) => s.counters.mdfHits, chips: 70 },
  { id: 'balance-10', name: 'Balanced Breakfast', emoji: '⚖️', desc: 'Match the solver bluff ratio within 5 points ten times.', target: 10, value: (s) => s.counters.balanceHits, chips: 70 },
  { id: 'streak-3', name: 'Warm Hearth', emoji: '🔥', desc: 'Practice three days in a row.', target: 3, value: (s) => s.streak.best, chips: 30 },
  { id: 'streak-7', name: 'A Week by the Fire', emoji: '🪵', desc: 'Practice seven days in a row.', target: 7, value: (s) => s.streak.best, chips: 80 },
  { id: 'streak-30', name: 'Eternal Flame', emoji: '🕯️', desc: 'Practice thirty days in a row.', target: 30, value: (s) => s.streak.best, chips: 250 },
  { id: 'blitz-10', name: 'Quick Paws', emoji: '🐾', desc: 'Score 10 in a Blitz run.', target: 10, value: (s) => s.counters.blitzBest, chips: 40 },
  { id: 'blitz-25', name: 'Lightning Paws', emoji: '⚡', desc: 'Score 25 in a Blitz run.', target: 25, value: (s) => s.counters.blitzBest, chips: 100 },
  { id: 'peck-1', name: 'First Peck', emoji: '🐦', desc: 'Complete a Woodpecker cycle.', target: 1, value: (s) => s.counters.woodpeckerCycles, chips: 50 },
  { id: 'peck-5', name: 'Woodpecker', emoji: '🌳', desc: 'Complete five Woodpecker cycles.', target: 5, value: (s) => s.counters.woodpeckerCycles, chips: 120 },
  { id: 'bloom-6', name: 'Green Thumb', emoji: '🌸', desc: 'Grow six plants to bloom.', target: 6, value: (s) => plantsAtLeast(s, 3), chips: 80 },
  { id: 'golden-1', name: 'Golden Bloom', emoji: '🌟', desc: 'Grow your first golden plant.', target: 1, value: (s) => plantsAtLeast(s, 4), chips: 120 },
  { id: 'review-20', name: 'Gardener', emoji: '💧', desc: 'Water 20 thirsty plants.', target: 20, value: (s) => s.counters.reviews, chips: 60 },
  { id: 'twin-5', name: 'Spot the Difference', emoji: '👯', desc: 'Play five twin spots.', target: 5, value: (s) => s.counters.twins, chips: 50 },
  { id: 'preflop-50', name: 'Chart Scholar', emoji: '🌰', desc: 'Build 50 preflop ranges.', target: 50, value: (s) => s.counters.streets?.preflop ?? 0, chips: 70 },
  {
    id: 'streets-4',
    name: 'Every Street',
    emoji: '🛤️',
    desc: 'Play five spots on each street: preflop, flop, turn and river.',
    target: 5,
    value: (s) => Math.min(...(['preflop', 'flop', 'turn', 'river'] as const).map((k) => s.counters.streets?.[k] ?? 0)),
    chips: 80,
  },
  { id: 'sketch-1', name: 'First Sketch', emoji: '✏️', desc: 'Finish a range sketch.', target: 1, value: (s) => s.counters.sketches ?? 0, chips: 40 },
  { id: 'sketch-75', name: 'Mind Reader', emoji: '🔮', desc: 'Score 75%+ overlap on a range sketch.', target: 75, value: (s) => s.counters.sketchBest ?? 0, chips: 100 },
];

export const achievementById = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);
