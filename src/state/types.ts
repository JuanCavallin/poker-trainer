import type { FindId, HandGrade, Tendencies } from '../engine/analysis';
import type { ProfileId } from '../engine/profiles';
import type { TextureId } from '../engine/texture';
import type { NodeType, SpotRequest } from '../engine/types';
import type { FamilyState } from '../learning/memory';

export type SessionKind = 'regular' | 'drill' | 'woodpecker' | 'review' | 'replay' | 'twin';
export type Confidence = 'unsure' | 'fair' | 'sure';

export interface AttemptRecord {
  id: string;
  ts: number;
  kind: SessionKind;
  family: string;
  nodeType: NodeType;
  texture: TextureId;
  profile: ProfileId;
  scenarioId: string;
  potType: 'SRP' | '3BP';
  request: SpotRequest;
  score: number;
  accuracy: number;
  balance: number | null;
  evLossPct: number;
  exploitPct: number | null;
  matchPct: number;
  hand: { combo: number; action: string; grade: HandGrade; lossPct: number };
  ms: number;
  confidence?: Confidence;
  tendencies: Tendencies;
  capture: number | null;
  finds: FindId[];
  difficulty: number;
}

export interface Counters {
  spots: number;
  great: number;
  perfectHands: number;
  finds: Partial<Record<FindId, number>>;
  blitzRuns: number;
  blitzBest: number;
  blitzRating: number;
  villains: ProfileId[];
  mdfHits: number;
  balanceHits: number;
  reviews: number;
  woodpeckerCycles: number;
  twins: number;
}

export interface Settings {
  sound: boolean;
  fourColor: boolean;
  theme: 'light' | 'dark' | 'auto';
  /** Theory guides on the live readout: auto fades them as a family is mastered. */
  hints: 'auto' | 'on' | 'off';
  unlockAll: boolean;
  confidence: boolean;
  reducedMotion: boolean;
}

export interface Streak {
  count: number;
  best: number;
  lastDay: string | null;
  freezes: number;
}

export type QuestKind = 'spots' | 'score80' | 'find' | 'review' | 'blitz' | 'villain' | 'facing' | 'balance' | 'perfect-hand';

export interface Quest {
  id: string;
  kind: QuestKind;
  label: string;
  emoji: string;
  target: number;
  progress: number;
  xp: number;
  chips: number;
  claimed: boolean;
}

export interface QuestState {
  day: string;
  quests: Quest[];
  bonusClaimed: boolean;
}

export interface Cosmetics {
  owned: string[];
  felt: string;
  back: string;
  companion: string;
}

export interface WoodpeckerCycle {
  startedAt: number;
  finishedAt?: number;
  perm: number[];
  results: { score: number; ms: number }[];
}

export interface WoodpeckerSet {
  id: string;
  name: string;
  createdAt: number;
  mode: 'mirror' | 'exact';
  spots: SpotRequest[];
  cycles: WoodpeckerCycle[];
}

export interface Scrap {
  id: string;
  ts: number;
  find: FindId;
  request: SpotRequest;
  combo: number;
  action: string;
  board: number[];
  family: string;
}

export interface BlitzRecord {
  ts: number;
  score: number;
  answered: number;
  rating: number;
  avgMs: number;
}

export interface PersistedState {
  version: 1;
  createdAt: number;
  xp: number;
  chips: number;
  streak: Streak;
  settings: Settings;
  counters: Counters;
  achievements: Record<string, number>;
  quests: QuestState;
  cosmetics: Cosmetics;
  families: Record<string, FamilyState>;
  history: AttemptRecord[];
  scrapbook: Scrap[];
  woodpecker: WoodpeckerSet[];
  blitz: BlitzRecord[];
  seenIntro: boolean;
}
