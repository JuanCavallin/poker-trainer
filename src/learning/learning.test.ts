import { describe, expect, it } from 'vitest';
import { familyKey } from '../engine/types';
import type { AttemptRecord } from '../state/types';
import { ALL_FAMILIES, familyFitsSeats, requestFamily, unlockedFamilies } from './families';
import { DAY, newFamily, plantStage, retrievability, reviewFamily } from './memory';
import { levelFromXp, xpForLevel } from './progress';
import { makeDailyQuests } from './quests';
import { nextRegular } from './selector';

describe('spaced repetition memory', () => {
  it('stretches intervals on success and shrinks them on failure', () => {
    const t0 = Date.parse('2026-01-01T12:00:00Z');
    let f = reviewFamily(undefined, 85, 30_000, t0).state;
    const s1 = f.stability;
    f = reviewFamily(f, 85, 30_000, t0 + s1 * DAY).state;
    expect(f.stability).toBeGreaterThan(s1 * 1.8);
    const before = f.stability;
    const lapse = reviewFamily(f, 30, 30_000, t0 + 10 * DAY);
    expect(lapse.grade).toBe('again');
    expect(lapse.state.stability).toBeLessThan(before * 0.5);
    expect(lapse.state.lapses).toBe(1);
  });

  it('decays retrievability to 90% at the due date', () => {
    const t0 = 1_000_000;
    const f = reviewFamily(newFamily(), 80, 20_000, t0).state;
    expect(retrievability(f, t0)).toBeCloseTo(1, 6);
    expect(retrievability(f, f.due)).toBeCloseTo(0.9, 6);
    expect(retrievability(f, f.due + 5 * DAY)).toBeLessThan(0.9);
  });

  it('grows plants with practice', () => {
    let f = newFamily();
    expect(plantStage(f)).toBe(0);
    let t = 0;
    for (let i = 0; i < 12; i++) {
      t += f.stability * DAY;
      f = reviewFamily(f, 95, 10_000, t).state;
    }
    expect(plantStage(f)).toBe(4);
  });
});

describe('adaptive selection', () => {
  it('never deals the same family twice in a row and respects unlocks', () => {
    const fams = unlockedFamilies(1, false);
    expect(fams.length).toBeGreaterThan(1);
    expect(fams.length).toBeLessThan(ALL_FAMILIES.length);
    for (let i = 0; i < 200; i++) {
      const last = fams[i % fams.length];
      const recent = [{ family: last, score: 80 } as AttemptRecord];
      const pick = nextRegular({ families: {}, level: 1, unlockAll: false, recent, relearn: [], sessionIndex: i, now: Date.now() });
      const fam = requestFamily(pick.request)!;
      expect(fam).not.toBe(last);
      expect(fams).toContain(fam);
      expect(pick.request.profile).toBe('gto');
    }
  });

  it('brings a missed family back after a few other spots', () => {
    const missed = familyKey('river', 'ip-vs-bet', 'dry');
    const pick = nextRegular({
      families: {},
      level: 1,
      unlockAll: false,
      recent: [{ family: familyKey('river', 'ip-vs-check', 'paired'), score: 80 } as AttemptRecord],
      relearn: [{ family: missed, at: 0 }],
      sessionIndex: 3,
      now: Date.now(),
    });
    expect(pick.reason).toBe('relearn');
    expect(requestFamily(pick.request)).toBe(missed);
  });

  it('keeps river family keys stable and parses every street', () => {
    expect(familyKey('river', 'ip-vs-bet', 'dry')).toBe('ip-vs-bet|dry');
    expect(familyKey('preflop', 'vs-open', 'BB')).toBe('pre:vs-open|BB');
    expect(ALL_FAMILIES.length).toBe(20 + 20 + 20 + 24);
    expect(new Set(ALL_FAMILIES).size).toBe(ALL_FAMILIES.length);
  });

  it('honours a training focus and fixed seats', () => {
    for (let i = 0; i < 100; i++) {
      const pre = nextRegular({ families: {}, level: 10, unlockAll: true, recent: [], relearn: [], sessionIndex: i, now: Date.now(), streets: ['preflop'], seats: { hero: 'BB' } });
      expect(pre.request.street).toBe('preflop');
      expect(pre.request.heroPos).toBe('BB');
      const post = nextRegular({ families: {}, level: 10, unlockAll: true, recent: [], relearn: [], sessionIndex: i, now: Date.now(), streets: ['flop', 'turn'], seats: { hero: 'BTN', villain: 'BB' } });
      expect(['flop', 'turn']).toContain(post.request.street);
      expect(post.request.nodeType!.startsWith('ip')).toBe(true);
      expect(familyFitsSeats(requestFamily(post.request)!, { hero: 'BTN', villain: 'BB' })).toBe(true);
    }
  });
});

describe('progress and quests', () => {
  it('maps XP to levels', () => {
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(xpForLevel(5)).level).toBe(5);
    expect(levelFromXp(xpForLevel(5) - 1).level).toBe(4);
  });

  it('makes three deterministic daily quests', () => {
    const a = makeDailyQuests('2026-10-08', 3, true);
    const b = makeDailyQuests('2026-10-08', 3, true);
    expect(a).toHaveLength(3);
    expect(a.map((q) => q.kind)).toEqual(b.map((q) => q.kind));
    expect(new Set(a.map((q) => q.kind)).size).toBe(3);
    expect(makeDailyQuests('2026-10-08', 3, false).some((q) => q.kind === 'review')).toBe(false);
  });
});
