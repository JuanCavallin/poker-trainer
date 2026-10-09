import { NUM_CLASSES, classCombos, comboClass } from './combos';
import { HAND_CATS, HC, HF } from './handinfo';
import type { SpotPackage } from './types';

/** A user's range strategy: row k (hero combo) x column a (action), layout k * nA + a. All-zero rows are unassigned. */
export type Strategy = Float32Array;

export const newStrategy = (spot: SpotPackage): Strategy => new Float32Array(spot.hero.n * spot.actions.length);

export function defaultActionIndex(spot: SpotPackage): number {
  const check = spot.actions.findIndex((a) => a.key === 'check');
  return check >= 0 ? check : spot.actions.findIndex((a) => a.key === 'fold');
}

export function rowSum(s: Strategy, k: number, nA: number): number {
  let t = 0;
  for (let a = 0; a < nA; a++) t += s[k * nA + a];
  return t;
}

/** Copy of the strategy with unassigned combos sent to the default (passive) action and rows normalised. */
export function resolveStrategy(spot: SpotPackage, s: Strategy): Strategy {
  const nA = spot.actions.length;
  const out = new Float32Array(s.length);
  const def = defaultActionIndex(spot);
  for (let k = 0; k < spot.hero.n; k++) {
    const sum = rowSum(s, k, nA);
    if (sum <= 1e-9) out[k * nA + def] = 1;
    else for (let a = 0; a < nA; a++) out[k * nA + a] = s[k * nA + a] / sum;
  }
  return out;
}

// ------------------------------------------------------------------ static per-spot stats

export interface SpotStats {
  totalWeight: number;
  villainWeight: number;
  /** Hero combo indices sorted strongest-first by equity vs villain's range. */
  heroOrder: number[];
  heroEquity: number;
  villainEquity: number;
  /** Share of each range in the strongest ~10% of hands on this board (combined). */
  heroNutShare: number;
  villainNutShare: number;
  /** Share of villain's range that loses to most of yours (it's a bluff if they bet it). */
  villainBluffShare: number;
  classMembers: number[][];
  villainClassMembers: number[][];
  /** Average hero weight across all combos of each class, 0..1. */
  classFill: Float32Array;
  villainClassFill: Float32Array;
  /** Average villain equity (vs hero) per class; NaN if absent. */
  villainClassEquity: Float32Array;
  categories: { cat: number; label: string; members: number[]; weight: number }[];
}

const statsCache = new WeakMap<SpotPackage, SpotStats>();

export function spotStats(spot: SpotPackage): SpotStats {
  const cached = statsCache.get(spot);
  if (cached) return cached;
  const H = spot.hero;
  const V = spot.villain;
  let totalWeight = 0;
  let heroEqSum = 0;
  for (let k = 0; k < H.n; k++) {
    totalWeight += H.weights[k];
    heroEqSum += H.weights[k] * H.equity[k];
  }
  let villainWeight = 0;
  let villEqSum = 0;
  let villBluff = 0;
  for (let j = 0; j < V.n; j++) {
    villainWeight += V.weights[j];
    villEqSum += V.weights[j] * V.equity[j];
    if (V.equity[j] < 0.5) villBluff += V.weights[j];
  }
  // Nut threshold: strength at the top 10% of the combined weighted distribution.
  const all: { s: number; w: number }[] = [];
  for (let k = 0; k < H.n; k++) all.push({ s: H.strength[k], w: H.weights[k] });
  for (let j = 0; j < V.n; j++) all.push({ s: V.strength[j], w: V.weights[j] });
  all.sort((a, b) => b.s - a.s);
  const combined = totalWeight + villainWeight;
  let cum = 0;
  let thr = all.length ? all[0].s : 0;
  for (const x of all) {
    cum += x.w;
    thr = x.s;
    if (cum >= combined * 0.1) break;
  }
  let heroNut = 0;
  let villNut = 0;
  for (let k = 0; k < H.n; k++) if (H.strength[k] >= thr) heroNut += H.weights[k];
  for (let j = 0; j < V.n; j++) if (V.strength[j] >= thr) villNut += V.weights[j];

  const classMembers: number[][] = Array.from({ length: NUM_CLASSES }, () => []);
  const classFill = new Float32Array(NUM_CLASSES);
  for (let k = 0; k < H.n; k++) {
    const cls = comboClass[H.combos[k]];
    classMembers[cls].push(k);
    classFill[cls] += H.weights[k];
  }
  const villainClassFill = new Float32Array(NUM_CLASSES);
  const villainClassEquity = new Float32Array(NUM_CLASSES).fill(NaN);
  const villainClassMembers: number[][] = Array.from({ length: NUM_CLASSES }, () => []);
  const vEq = new Float32Array(NUM_CLASSES);
  for (let j = 0; j < V.n; j++) {
    const cls = comboClass[V.combos[j]];
    villainClassMembers[cls].push(j);
    villainClassFill[cls] += V.weights[j];
    vEq[cls] += V.weights[j] * V.equity[j];
  }
  for (let c = 0; c < NUM_CLASSES; c++) {
    const n = classCombos[c].length;
    if (villainClassFill[c] > 0) villainClassEquity[c] = vEq[c] / villainClassFill[c];
    classFill[c] /= n;
    villainClassFill[c] /= n;
  }

  const catMap = new Map<number, number[]>();
  for (let k = 0; k < H.n; k++) {
    const list = catMap.get(H.cat[k]) ?? [];
    list.push(k);
    catMap.set(H.cat[k], list);
  }
  const categories = [...catMap.entries()]
    .map(([cat, members]) => ({ cat, label: HAND_CATS[cat].label, members, weight: members.reduce((s, k) => s + H.weights[k], 0) }))
    .sort((a, b) => a.cat - b.cat);

  const heroOrder = Array.from({ length: H.n }, (_, k) => k).sort((a, b) => H.equity[b] - H.equity[a] || H.strength[b] - H.strength[a]);

  const stats: SpotStats = {
    totalWeight,
    villainWeight,
    heroOrder,
    heroEquity: totalWeight > 0 ? heroEqSum / totalWeight : 0,
    villainEquity: villainWeight > 0 ? villEqSum / villainWeight : 0,
    heroNutShare: totalWeight > 0 ? heroNut / totalWeight : 0,
    villainNutShare: villainWeight > 0 ? villNut / villainWeight : 0,
    villainBluffShare: villainWeight > 0 ? villBluff / villainWeight : 0,
    classMembers,
    villainClassMembers,
    classFill,
    villainClassFill,
    villainClassEquity,
    categories,
  };
  statsCache.set(spot, stats);
  return stats;
}

/** Equity buckets used for quick-select and villain range colouring. */
export const BUCKETS = [
  { key: 'nuts', label: 'Nutted', min: 0.9, color: 'var(--b-nuts)' },
  { key: 'strong', label: 'Strong', min: 0.7, color: 'var(--b-strong)' },
  { key: 'medium', label: 'Medium', min: 0.45, color: 'var(--b-medium)' },
  { key: 'weak', label: 'Weak', min: 0.2, color: 'var(--b-weak)' },
  { key: 'air', label: 'Air', min: -1, color: 'var(--b-air)' },
] as const;

export const bucketOf = (equity: number): number => BUCKETS.findIndex((b) => equity >= b.min);

// ------------------------------------------------------------------ live metrics

export interface ActionMetric {
  index: number;
  freq: number;
  combos: number;
  valueCombos: number;
  bluffCombos: number;
  bluffShare: number;
  theoryBluff: number | null;
  avgEquity: number;
}

export interface LiveMetrics {
  total: number;
  unassigned: number;
  actions: ActionMetric[];
  facing: boolean;
  continueFreq: number;
  aggressionFreq: number;
  /** Average equity (vs villain's whole range) of the hands you continue with. */
  continueEquity: number;
  /** Share of strong hands (equity >= 70%) among the hands you check. */
  checkStrongShare: number;
}

export function liveMetrics(spot: SpotPackage, s: Strategy): LiveMetrics {
  const nA = spot.actions.length;
  const H = spot.hero;
  const def = defaultActionIndex(spot);
  const freq = new Array(nA).fill(0);
  const val = new Array(nA).fill(0);
  const bluff = new Array(nA).fill(0);
  const eqSum = new Array(nA).fill(0);
  let total = 0;
  let unassigned = 0;
  for (let k = 0; k < H.n; k++) {
    const w = H.weights[k];
    total += w;
    const sum = rowSum(s, k, nA);
    for (let a = 0; a < nA; a++) {
      const p = sum > 1e-9 ? s[k * nA + a] / sum : a === def ? 1 : 0;
      if (p === 0) continue;
      const c = w * p;
      freq[a] += c;
      eqSum[a] += c * H.equity[k];
      if (spot.actions[a].aggressive) {
        if (spot.solution.contEq[k * nA + a] >= 0.5) val[a] += c;
        else bluff[a] += c;
      }
    }
    if (sum <= 1e-9) unassigned += w;
  }
  const facing = spot.toCall > 0;
  let cont = 0;
  let contEq = 0;
  let aggr = 0;
  let checkW = 0;
  let checkStrong = 0;
  spot.actions.forEach((opt, a) => {
    if (opt.key !== 'fold') {
      cont += freq[a];
      contEq += eqSum[a];
    }
    if (opt.aggressive) aggr += freq[a];
  });
  const checkIdx = spot.actions.findIndex((x) => x.key === 'check');
  if (checkIdx >= 0) {
    for (let k = 0; k < H.n; k++) {
      const sum = rowSum(s, k, nA);
      const p = sum > 1e-9 ? s[k * nA + checkIdx] / sum : checkIdx === def ? 1 : 0;
      checkW += H.weights[k] * p;
      if (H.equity[k] >= 0.7) checkStrong += H.weights[k] * p;
    }
  }
  return {
    total,
    unassigned,
    facing,
    actions: spot.actions.map((_, a) => ({
      index: a,
      freq: total > 0 ? freq[a] / total : 0,
      combos: freq[a],
      valueCombos: val[a],
      bluffCombos: bluff[a],
      bluffShare: val[a] + bluff[a] > 1e-9 ? bluff[a] / (val[a] + bluff[a]) : NaN,
      theoryBluff: spot.theory.perAction[a]?.bluffShare ?? null,
      avgEquity: freq[a] > 1e-9 ? eqSum[a] / freq[a] : NaN,
    })),
    continueFreq: total > 0 ? cont / total : 0,
    aggressionFreq: total > 0 ? aggr / total : 0,
    continueEquity: cont > 1e-9 ? contEq / cont : NaN,
    checkStrongShare: checkW > 1e-9 ? checkStrong / checkW : NaN,
  };
}

// ------------------------------------------------------------------ scoring

export type HandGrade = 'Perfect' | 'Great' | 'Good' | 'Inaccuracy' | 'Mistake' | 'Blunder';

export const GRADE_INFO: Record<HandGrade, { emoji: string; tone: 'great' | 'good' | 'meh' | 'bad' }> = {
  Perfect: { emoji: '🌟', tone: 'great' },
  Great: { emoji: '✨', tone: 'great' },
  Good: { emoji: '👍', tone: 'good' },
  Inaccuracy: { emoji: '🤏', tone: 'meh' },
  Mistake: { emoji: '😬', tone: 'bad' },
  Blunder: { emoji: '💥', tone: 'bad' },
};

export interface HandResult {
  k: number;
  action: number;
  evs: number[];
  best: number;
  lossBb: number;
  lossPct: number;
  refFreq: number;
  grade: HandGrade;
}

export function gradeHand(spot: SpotPackage, k: number, action: number): HandResult {
  const nA = spot.actions.length;
  const evs = spot.actions.map((_, a) => spot.solution.ev[k * nA + a]);
  let best = 0;
  for (let a = 1; a < nA; a++) if (evs[a] > evs[best]) best = a;
  const lossBb = Math.max(0, evs[best] - evs[action]);
  const lossPct = (100 * lossBb) / spot.pot;
  const refFreq = spot.solution.strategy[k * nA + action];
  let grade: HandGrade;
  if (lossPct <= 0.15 || refFreq >= 0.5) grade = 'Perfect';
  else if (lossPct <= 0.6 || refFreq >= 0.2) grade = 'Great';
  else if (lossPct <= 1.5) grade = 'Good';
  else if (lossPct <= 4) grade = 'Inaccuracy';
  else if (lossPct <= 10) grade = 'Mistake';
  else grade = 'Blunder';
  return { k, action, evs, best, lossBb, lossPct, refFreq, grade };
}

export interface Tendencies {
  aggr?: number;
  bluff?: number;
  defense?: number;
  raise?: number;
  sizing?: number;
  thin?: number;
  bluffSel?: number;
}

export interface RangeScore {
  score: number;
  stars: number;
  /** 0..100 from EV loss per hand: did each hand take a good action? */
  accuracy: number;
  /** 0..100 from exploitability (GTO spots only): could a perfect opponent punish your frequencies? */
  balance: number | null;
  evLossBb: number;
  evLossPct: number;
  matchPct: number;
  exploitPct: number | null;
  userFreq: number[];
  refFreq: number[];
  userBluff: number[];
  refBluff: number[];
  classLoss: Float32Array;
  leaks: { k: number; lossBb: number; weighted: number }[];
  tendencies: Tendencies;
  /** Exploit spots: share of the available exploit EV the user captured (0 = GTO, 1 = max). */
  capture: number | null;
}

export const accuracyFromLoss = (evLossPct: number): number => 100 * Math.exp(-Math.max(0, evLossPct) / 4);
export const balanceFromExploit = (exploitPct: number): number => 100 * Math.exp(-Math.max(0, exploitPct) / 15);

export function scoreFromLoss(evLossPct: number, exploitPct: number | null): number {
  const acc = accuracyFromLoss(evLossPct);
  const s = exploitPct == null ? acc : 0.6 * acc + 0.4 * balanceFromExploit(exploitPct);
  return Math.max(0, Math.min(100, Math.round(s)));
}

export const starsFor = (score: number): number => (score >= 90 ? 3 : score >= 75 ? 2 : score >= 55 ? 1 : 0);

export function scoreRange(spot: SpotPackage, user: Strategy, exploitPct: number | null): RangeScore {
  const nA = spot.actions.length;
  const H = spot.hero;
  const sol = spot.solution;
  const facing = spot.toCall > 0;
  let wsum = 0;
  let loss = 0;
  let match = 0;
  let evU = 0;
  let evG = 0;
  let evR = 0;
  const userFreq = new Array(nA).fill(0);
  const refFreq = new Array(nA).fill(0);
  const uVal = new Array(nA).fill(0);
  const uBl = new Array(nA).fill(0);
  const rVal = new Array(nA).fill(0);
  const rBl = new Array(nA).fill(0);
  const classLoss = new Float32Array(NUM_CLASSES);
  const leaks: RangeScore['leaks'] = [];
  let thinW = 0;
  let thinU = 0;
  let thinR = 0;
  let selW = 0;
  let selR = 0;
  const isBig = (a: number) => spot.actions[a].key === 'allin' || spot.actions[a].frac >= 0.6;

  for (let k = 0; k < H.n; k++) {
    const w = H.weights[k];
    wsum += w;
    let best = -Infinity;
    for (let a = 0; a < nA; a++) best = Math.max(best, sol.ev[k * nA + a]);
    let uev = 0;
    let tv = 0;
    let uAggr = 0;
    let rAggr = 0;
    let uBluffMass = 0;
    for (let a = 0; a < nA; a++) {
      const u = user[k * nA + a];
      const r = sol.strategy[k * nA + a];
      const g = sol.gtoStrategy[k * nA + a];
      const ev = sol.ev[k * nA + a];
      uev += u * ev;
      evU += w * u * ev;
      evG += w * g * ev;
      evR += w * r * ev;
      tv += Math.abs(u - r);
      userFreq[a] += w * u;
      refFreq[a] += w * r;
      if (spot.actions[a].aggressive) {
        uAggr += u;
        rAggr += r;
        const isValue = sol.contEq[k * nA + a] >= 0.5;
        if (isValue) {
          uVal[a] += w * u;
          rVal[a] += w * r;
        } else {
          uBl[a] += w * u;
          rBl[a] += w * r;
          uBluffMass += u;
        }
      }
    }
    // Bluff selection: how much of the hand's bluffing the reference also does (any size).
    if (uBluffMass > 0) {
      selW += w * uBluffMass;
      selR += w * Math.min(uBluffMass, rAggr);
    }
    // Ignore differences below solver precision (0.1% of the pot) so near-indifferent mixes aren't penalised.
    const l = Math.max(0, best - uev - 0.001 * spot.pot);
    loss += w * l;
    match += w * (1 - tv / 2);
    classLoss[comboClass[H.combos[k]]] += w * l;
    leaks.push({ k, lossBb: l, weighted: w * l });
    if (!facing && H.equity[k] >= 0.5 && H.equity[k] < 0.8) {
      thinW += w;
      thinU += w * uAggr;
      thinR += w * rAggr;
    }
  }
  leaks.sort((a, b) => b.weighted - a.weighted);

  const evLossBb = wsum > 0 ? loss / wsum : 0;
  const evLossPct = (100 * evLossBb) / spot.pot;
  const score = scoreFromLoss(evLossPct, exploitPct);
  const share = (x: number[]) => x.map((v) => (wsum > 0 ? v / wsum : 0));
  const uF = share(userFreq);
  const rF = share(refFreq);

  const sumIdx = (arr: number[], pred: (a: number) => boolean) => arr.reduce((s, v, a) => (pred(a) ? s + v : s), 0);
  const aggrPred = (a: number) => spot.actions[a].aggressive;
  const tendencies: Tendencies = {};
  const uAggrF = sumIdx(uF, aggrPred);
  const rAggrF = sumIdx(rF, aggrPred);
  tendencies.aggr = uAggrF - rAggrF;
  const uBluffTot = sumIdx(uBl, aggrPred);
  const uValTot = sumIdx(uVal, aggrPred);
  const rBluffTot = sumIdx(rBl, aggrPred);
  const rValTot = sumIdx(rVal, aggrPred);
  if (uBluffTot + uValTot > 0.02 * wsum && rBluffTot + rValTot > 0.02 * wsum) {
    tendencies.bluff = uBluffTot / (uBluffTot + uValTot) - rBluffTot / (rBluffTot + rValTot);
  }
  if (facing) {
    const contPred = (a: number) => spot.actions[a].key !== 'fold';
    tendencies.defense = sumIdx(uF, contPred) - sumIdx(rF, contPred);
    tendencies.raise = uAggrF - rAggrF;
  } else {
    if (uAggrF > 0.03 && rAggrF > 0.03) {
      const bigPred = (a: number) => aggrPred(a) && isBig(a);
      tendencies.sizing = sumIdx(uF, bigPred) / uAggrF - sumIdx(rF, bigPred) / rAggrF;
    }
    if (thinW > 0.03 * wsum) tendencies.thin = (thinU - thinR) / thinW;
  }
  if (selW > 0.01 * wsum) tendencies.bluffSel = selR / selW;

  let capture: number | null = null;
  if (sol.mode === 'exploit') {
    const gain = (evR - evG) / wsum;
    if (gain > 0.004 * spot.pot) capture = Math.max(-1, Math.min(1.2, (evU - evG) / wsum / gain));
  }

  return {
    score,
    stars: starsFor(score),
    accuracy: Math.round(accuracyFromLoss(evLossPct)),
    balance: exploitPct == null ? null : Math.round(balanceFromExploit(exploitPct)),
    evLossBb,
    evLossPct,
    matchPct: wsum > 0 ? (100 * match) / wsum : 0,
    exploitPct,
    userFreq: uF,
    refFreq: rF,
    userBluff: spot.actions.map((_, a) => (uVal[a] + uBl[a] > 1e-9 ? uBl[a] / (uVal[a] + uBl[a]) : NaN)),
    refBluff: spot.actions.map((_, a) => (rVal[a] + rBl[a] > 1e-9 ? rBl[a] / (rVal[a] + rBl[a]) : NaN)),
    classLoss,
    leaks: leaks.slice(0, 8),
    tendencies,
    capture,
  };
}

// ------------------------------------------------------------------ highlight plays ("finds")

export type FindId = 'hero-call' | 'brave-bluff' | 'bluff-raise' | 'thin-value' | 'big-fold' | 'blocker-bluff' | 'trap' | 'exploit';

export const FINDS: Record<FindId, { title: string; emoji: string; desc: string }> = {
  'hero-call': { title: 'Hero Call', emoji: '🦸', desc: 'Called with a hand that loses to most of their betting range, and it was right.' },
  'brave-bluff': { title: 'Brave Bluff', emoji: '🦁', desc: 'Fired a big bluff with a hand that has almost no showdown value.' },
  'bluff-raise': { title: 'Bluff Raise', emoji: '🌪️', desc: 'Raised as a bluff when the solver loves it too.' },
  'thin-value': { title: 'Thin Value', emoji: '🔪', desc: 'Bet a medium-strength hand for value that many players would check.' },
  'big-fold': { title: 'Big Laydown', emoji: '🧘', desc: 'Folded a strong-looking hand against a range that crushes it.' },
  'blocker-bluff': { title: 'Blocker Bandit', emoji: '🔑', desc: 'Chose a bluff whose cards block villain’s strongest hands.' },
  trap: { title: 'Sneaky Trap', emoji: '🪤', desc: 'Checked a monster to let villain bet into you.' },
  exploit: { title: 'Exploit Spotted', emoji: '🎯', desc: 'Deviated from equilibrium in exactly the right direction against this villain.' },
};

export function detectFinds(spot: SpotPackage, hand: HandResult): FindId[] {
  const out: FindId[] = [];
  const nA = spot.actions.length;
  const { k, action } = hand;
  const opt = spot.actions[action];
  const H = spot.hero;
  const ok = hand.lossPct <= 1.5;
  if (!ok) return out;
  const cat = H.cat[k];
  const flags = H.flags[k];
  const ref = (a: number) => spot.solution.strategy[k * nA + a];
  const facing = spot.toCall > 0;

  if (facing && opt.key === 'call' && H.equity[k] < 0.45 && ref(action) >= 0.5 && cat >= HC.SECONDPAIR) out.push('hero-call');
  if (opt.aggressive) {
    const ce = spot.solution.contEq[k * nA + action];
    const bluff = Number.isFinite(ce) && ce < 0.25;
    if (bluff && ref(action) >= 0.35) {
      if (facing) out.push('bluff-raise');
      else if (opt.key === 'allin' || opt.frac >= 0.7) out.push('brave-bluff');
      if (flags & (HF.NUT_FLUSH_BLOCKER | HF.FLUSH_BLOCKER)) out.push('blocker-bluff');
    }
    if (!facing && Number.isFinite(ce) && ce >= 0.5 && ce < 0.64 && ref(action) >= 0.4 && cat >= HC.TOPPAIR) out.push('thin-value');
  }
  if (facing && opt.key === 'fold' && cat <= HC.TOPPAIR && ref(action) >= 0.5) out.push('big-fold');
  if (!facing && opt.key === 'check' && spot.nodeType === 'oop-first' && H.equity[k] >= 0.85 && ref(action) >= 0.5) out.push('trap');
  if (spot.solution.mode === 'exploit' && hand.lossPct <= 0.5 && spot.solution.gtoStrategy[k * nA + action] <= 0.25) out.push('exploit');
  return out;
}
