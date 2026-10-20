import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { ACHIEVEMENTS } from '../learning/achievements';
import { reviewFamily } from '../learning/memory';
import { chipsForSpot, dayKey, daysBetween, levelFromXp, xpForSpot } from '../learning/progress';
import { QUEST_BONUS, makeDailyQuests, questIncrement, type QuestEvent } from '../learning/quests';
import { dueFamilies } from '../learning/selector';
import { cosmeticById } from './cosmetics';
import type { AttemptRecord, BlitzRecord, PersistedState, Scrap, Settings, Streak, WoodpeckerSet } from './types';

export interface Outcome {
  xp: number;
  chips: number;
  levelUp: number | null;
  achievements: string[];
  quests: string[];
  streakUp: boolean;
}

interface Actions {
  ensureDaily: () => void;
  recordAttempt: (rec: AttemptRecord, extra: { balanceHit: boolean; mdfHit: boolean; board: number[] }) => Outcome;
  recordBlitz: (rec: BlitzRecord, xp: number, chips: number) => Outcome;
  claimQuest: (id: string) => void;
  claimBonus: () => void;
  buy: (id: string) => boolean;
  equip: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addWoodpecker: (set: WoodpeckerSet) => void;
  updateWoodpecker: (id: string, fn: (s: WoodpeckerSet) => WoodpeckerSet) => void;
  deleteWoodpecker: (id: string) => void;
  completeCycle: () => Outcome;
  markIntroSeen: () => void;
  resetAll: () => void;
  importData: (json: string) => boolean;
}

export type Store = PersistedState & Actions;

export const defaultSettings: Settings = {
  sound: true,
  fourColor: true,
  theme: 'light',
  hints: 'auto',
  unlockAll: false,
  confidence: true,
  reducedMotion: false,
  focus: 'all',
  heroSeat: 'any',
  villainSeat: 'any',
};

function freshState(): PersistedState {
  return {
    version: 1,
    createdAt: Date.now(),
    xp: 0,
    chips: 60,
    streak: { count: 0, best: 0, lastDay: null, freezes: 0 },
    settings: { ...defaultSettings },
    counters: {
      spots: 0,
      great: 0,
      perfectHands: 0,
      finds: {},
      blitzRuns: 0,
      blitzBest: 0,
      blitzRating: 1000,
      villains: [],
      mdfHits: 0,
      balanceHits: 0,
      reviews: 0,
      woodpeckerCycles: 0,
      twins: 0,
      streets: {},
      sketches: 0,
      sketchBest: 0,
    },
    achievements: {},
    quests: { day: '', quests: [], bonusClaimed: false },
    cosmetics: { owned: ['felt-forest', 'back-plaid', 'pet-cat'], felt: 'felt-forest', back: 'back-plaid', companion: 'pet-cat' },
    families: {},
    history: [],
    scrapbook: [],
    woodpecker: [],
    blitz: [],
    seenIntro: false,
  };
}

function bumpStreak(st: Streak, today: string): { streak: Streak; up: boolean } {
  if (st.lastDay === today) return { streak: st, up: false };
  let freezes = st.freezes;
  let count = 1;
  if (st.lastDay) {
    const gap = daysBetween(st.lastDay, today);
    if (gap === 1) count = st.count + 1;
    else if (gap === 2 && freezes > 0) {
      freezes -= 1;
      count = st.count + 1;
    }
  }
  if (count > 0 && count % 7 === 0) freezes = Math.min(2, freezes + 1);
  return { streak: { count, best: Math.max(st.best, count), lastDay: today, freezes }, up: true };
}

/** Streak as it should be displayed today (0 if it has lapsed). */
export function liveStreak(st: Streak): number {
  if (!st.lastDay) return 0;
  const gap = daysBetween(st.lastDay, dayKey());
  if (gap <= 1) return st.count;
  if (gap === 2 && st.freezes > 0) return st.count;
  return 0;
}

const PERSIST_KEYS: (keyof PersistedState)[] = [
  'version',
  'createdAt',
  'xp',
  'chips',
  'streak',
  'settings',
  'counters',
  'achievements',
  'quests',
  'cosmetics',
  'families',
  'history',
  'scrapbook',
  'woodpecker',
  'blitz',
  'seenIntro',
];

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      /** Applies achievements and level-up detection after a state change. */
      const settle = (before: PersistedState, after: PersistedState, base: Omit<Outcome, 'levelUp' | 'achievements'>): Outcome => {
        const unlocked: string[] = [];
        let bonusChips = 0;
        const achievements = { ...after.achievements };
        for (const a of ACHIEVEMENTS) {
          if (achievements[a.id]) continue;
          if (a.value(after) >= a.target) {
            achievements[a.id] = Date.now();
            unlocked.push(a.id);
            bonusChips += a.chips;
          }
        }
        const lvBefore = levelFromXp(before.xp).level;
        const lvAfter = levelFromXp(after.xp).level;
        set({ achievements, chips: after.chips + bonusChips });
        return { ...base, chips: base.chips + bonusChips, achievements: unlocked, levelUp: lvAfter > lvBefore ? lvAfter : null };
      };

      const applyQuests = (s: PersistedState, ev: QuestEvent): { quests: PersistedState['quests']; completed: string[] } => {
        const completed: string[] = [];
        const quests = s.quests.quests.map((q) => {
          if (q.progress >= q.target) return q;
          const inc = questIncrement(q, ev);
          if (!inc) return q;
          const progress = Math.min(q.target, q.progress + inc);
          if (progress >= q.target) completed.push(q.id);
          return { ...q, progress };
        });
        return { quests: { ...s.quests, quests }, completed };
      };

      return {
        ...freshState(),

        ensureDaily: () => {
          const s = get();
          const today = dayKey();
          if (s.quests.day === today) return;
          const level = levelFromXp(s.xp).level;
          const hasDue = dueFamilies(s.families, Date.now()).length > 0;
          set({ quests: { day: today, quests: makeDailyQuests(today, level, hasDue), bonusClaimed: false } });
        },

        recordAttempt: (rec, extra) => {
          get().ensureDaily();
          const before = get();
          const now = Date.now();
          const { state: fam } = reviewFamily(before.families[rec.family], rec.score, rec.ms, now);
          const findBonus = rec.finds.length * 5;
          const xp = xpForSpot(rec.score, rec.difficulty) + findBonus;
          const chips = chipsForSpot(rec.score) + findBonus;
          const counters = { ...before.counters, finds: { ...before.counters.finds } };
          counters.spots += 1;
          if (rec.score >= 90) counters.great += 1;
          if (rec.hand.grade === 'Perfect') counters.perfectHands += 1;
          for (const f of rec.finds) counters.finds[f] = (counters.finds[f] ?? 0) + 1;
          if (rec.profile !== 'gto' && !counters.villains.includes(rec.profile)) counters.villains = [...counters.villains, rec.profile];
          if (extra.mdfHit) counters.mdfHits += 1;
          if (extra.balanceHit) counters.balanceHits += 1;
          if (rec.kind === 'review') counters.reviews += 1;
          if (rec.kind === 'twin') counters.twins += 1;
          const street = rec.street ?? 'river';
          counters.streets = { ...counters.streets, [street]: (counters.streets?.[street] ?? 0) + 1 };
          if (rec.sketch) {
            counters.sketches += 1;
            counters.sketchBest = Math.max(counters.sketchBest, Math.round(rec.sketch.overlap * 100));
          }
          const { streak, up } = bumpStreak(before.streak, dayKey());
          const scraps: Scrap[] = rec.finds.map((find, i) => ({
            id: `${rec.id}-${i}`,
            ts: now,
            find,
            request: rec.request,
            combo: rec.hand.combo,
            action: rec.hand.action,
            board: extra.board,
            family: rec.family,
          }));
          const after: PersistedState = {
            ...before,
            xp: before.xp + xp,
            chips: before.chips + chips,
            families: { ...before.families, [rec.family]: fam },
            history: [rec, ...before.history].slice(0, 1500),
            counters,
            streak,
            scrapbook: [...scraps, ...before.scrapbook].slice(0, 300),
          };
          const q = applyQuests(after, { type: 'attempt', rec, balanceHit: extra.balanceHit });
          after.quests = q.quests;
          set({ ...after });
          return settle(before, after, { xp, chips, quests: q.completed, streakUp: up });
        },

        recordBlitz: (rec, xp, chips) => {
          get().ensureDaily();
          const before = get();
          const counters = { ...before.counters, blitzRuns: before.counters.blitzRuns + 1, blitzBest: Math.max(before.counters.blitzBest, rec.score), blitzRating: rec.rating };
          const { streak, up } = bumpStreak(before.streak, dayKey());
          const after: PersistedState = { ...before, xp: before.xp + xp, chips: before.chips + chips, counters, streak, blitz: [rec, ...before.blitz].slice(0, 200) };
          const q = applyQuests(after, { type: 'blitz' });
          after.quests = q.quests;
          set({ ...after });
          return settle(before, after, { xp, chips, quests: q.completed, streakUp: up });
        },

        claimQuest: (id) => {
          const s = get();
          const q = s.quests.quests.find((x) => x.id === id);
          if (!q || q.claimed || q.progress < q.target) return;
          set({
            xp: s.xp + q.xp,
            chips: s.chips + q.chips,
            quests: { ...s.quests, quests: s.quests.quests.map((x) => (x.id === id ? { ...x, claimed: true } : x)) },
          });
        },

        claimBonus: () => {
          const s = get();
          if (s.quests.bonusClaimed || !s.quests.quests.length || s.quests.quests.some((q) => !q.claimed)) return;
          set({ xp: s.xp + QUEST_BONUS.xp, chips: s.chips + QUEST_BONUS.chips, quests: { ...s.quests, bonusClaimed: true } });
        },

        buy: (id) => {
          const s = get();
          const item = cosmeticById(id);
          if (!item || s.cosmetics.owned.includes(id) || s.chips < item.price) return false;
          set({ chips: s.chips - item.price, cosmetics: { ...s.cosmetics, owned: [...s.cosmetics.owned, id] } });
          get().equip(id);
          return true;
        },

        equip: (id) => {
          const s = get();
          const item = cosmeticById(id);
          if (!item || !s.cosmetics.owned.includes(id)) return;
          const key = item.kind === 'felt' ? 'felt' : item.kind === 'back' ? 'back' : 'companion';
          set({ cosmetics: { ...s.cosmetics, [key]: id } });
        },

        updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),

        addWoodpecker: (ws) => set({ woodpecker: [ws, ...get().woodpecker] }),
        updateWoodpecker: (id, fn) => set({ woodpecker: get().woodpecker.map((w) => (w.id === id ? fn(w) : w)) }),
        deleteWoodpecker: (id) => set({ woodpecker: get().woodpecker.filter((w) => w.id !== id) }),

        completeCycle: () => {
          const before = get();
          const after: PersistedState = {
            ...before,
            xp: before.xp + 80,
            chips: before.chips + 40,
            counters: { ...before.counters, woodpeckerCycles: before.counters.woodpeckerCycles + 1 },
          };
          set({ ...after });
          return settle(before, after, { xp: 80, chips: 40, quests: [], streakUp: false });
        },

        markIntroSeen: () => set({ seenIntro: true }),

        resetAll: () => set({ ...freshState() }),

        importData: (json) => {
          try {
            const data = JSON.parse(json) as Partial<PersistedState>;
            if (data.version !== 1 || !Array.isArray(data.history)) return false;
            set({ ...freshState(), ...data });
            return true;
          } catch {
            return false;
          }
        },
      };
    },
    {
      name: 'range-den-v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]])) as Partial<Store>,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<PersistedState>;
        return {
          ...current,
          ...p,
          settings: { ...defaultSettings, ...(p.settings ?? {}) },
          counters: { ...current.counters, ...(p.counters ?? {}), streets: { ...(p.counters?.streets ?? {}) } },
        };
      },
    },
  ),
);

export function exportData(): string {
  const s = useStore.getState();
  return JSON.stringify(Object.fromEntries(PERSIST_KEYS.map((k) => [k, s[k]])), null, 2);
}

export interface Toast {
  id: number;
  emoji: string;
  title: string;
  body?: string;
  tone?: 'gold' | 'green' | 'plain';
}

export const useToasts = create<{ toasts: Toast[]; push: (t: Omit<Toast, 'id'>) => void; dismiss: (id: number) => void }>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { ...t, id }].slice(-4) });
    setTimeout(() => get().dismiss(id), 4200);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((x) => x.id !== id) }),
}));
