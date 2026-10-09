import type { HandResult, RangeScore, Strategy } from '../engine/analysis';
import { comboC1, comboC2, comboPretty } from '../engine/combos';
import { describeHand } from '../engine/handinfo';
import { PROFILES } from '../engine/profiles';
import type { SpotPackage } from '../engine/types';
import { bb, pct } from './util';

export interface Insight {
  icon: string;
  text: string;
  tone?: 'good' | 'warn';
}

const refName = (spot: SpotPackage) => (spot.solution.mode === 'gto' ? 'the solver' : 'the best exploit');

export function buildInsights(spot: SpotPackage, user: Strategy, score: RangeScore): Insight[] {
  const out: Insight[] = [];
  const nA = spot.actions.length;
  const ref = refName(spot);
  const facing = spot.toCall > 0;

  if (score.score >= 90) out.push({ icon: '🌟', text: `Excellent range. You lose only ${bb(score.evLossBb, 2)} per hand compared with ${ref}.`, tone: 'good' });

  if (spot.solution.mode === 'exploit') {
    const p = PROFILES[spot.profile];
    if (score.capture != null) {
      out.push({
        icon: p.emoji,
        text:
          score.capture >= 0.7
            ? `You captured ${pct(score.capture)} of the extra value available against ${p.name}. Great adjustment!`
            : score.capture > 0.2
              ? `You captured ${pct(score.capture)} of the available exploit vs ${p.name}. ${p.exploit}`
              : `You played close to equilibrium (or worse) vs ${p.name}: ${pct(Math.max(0, score.capture))} of the exploit captured. ${p.exploit}`,
        tone: score.capture >= 0.7 ? 'good' : 'warn',
      });
    }
  }

  if (facing) {
    const cont = (f: number[]) => f.reduce((s, v, a) => (spot.actions[a].key !== 'fold' ? s + v : s), 0);
    const u = cont(score.userFreq);
    const r = cont(score.refFreq);
    if (Math.abs(u - r) > 0.07) {
      out.push({
        icon: u < r ? '🐢' : '🎣',
        text: `You continued with ${pct(u)} of your range; ${ref} continues with ${pct(r)} (MDF ${pct(spot.theory.mdf)}). ${u < r ? 'Over-folding hands that can catch bluffs.' : 'Calling too many hands that are behind.'}`,
        tone: 'warn',
      });
    } else out.push({ icon: '🛡️', text: `Your defence frequency (${pct(u)}) is close to ${ref} (${pct(r)}).`, tone: 'good' });
  }

  spot.actions.forEach((opt, a) => {
    if (!opt.aggressive) return;
    const u = score.userFreq[a];
    const r = score.refFreq[a];
    if (Math.abs(u - r) > 0.08) {
      out.push({
        icon: u > r ? '📈' : '📉',
        text: `${opt.short}: you used it with ${pct(u)} of your range, ${ref} uses ${pct(r)}.`,
        tone: 'warn',
      });
    }
    const ub = score.userBluff[a];
    const rb = score.refBluff[a];
    const th = spot.theory.perAction[a]?.bluffShare;
    if (u > 0.03 && Number.isFinite(ub)) {
      const refTxt = Number.isFinite(rb) ? `${ref} ${pct(rb)}` : `${ref} doesn't use it`;
      const diff = Number.isFinite(rb) ? ub - rb : ub - (th ?? 0);
      if (Math.abs(diff) > 0.08)
        out.push({
          icon: diff > 0 ? '🎈' : '🧱',
          text: `Your ${opt.short} range was ${pct(ub)} bluffs (${refTxt}, theory ${pct(th ?? NaN)}). ${diff > 0 ? 'Too many bluffs: a thinking opponent just calls more.' : 'Too few bluffs: opponents can fold everything but the nuts.'}`,
          tone: 'warn',
        });
      else out.push({ icon: '⚖️', text: `Your ${opt.short} bluff ratio (${pct(ub)}) is right in line (${refTxt}).`, tone: 'good' });
    }
  });

  if (score.tendencies.bluffSel != null && score.tendencies.bluffSel < 0.4) {
    out.push({ icon: '🔑', text: `Only ${pct(score.tendencies.bluffSel)} of your bluffs are hands ${ref} also bluffs with. Prefer bluffs that block villain's calls and unblock their folds (e.g. missed draws without showdown value).`, tone: 'warn' });
  }
  if (score.tendencies.thin != null && score.tendencies.thin < -0.2) {
    out.push({ icon: '🔪', text: `You checked a lot of medium-strong hands that ${ref} bets for thin value.`, tone: 'warn' });
  }

  const leaks = score.leaks.filter((l) => l.lossBb > 0.02 * spot.pot).slice(0, 3);
  for (const l of leaks) {
    const id = spot.hero.combos[l.k];
    const d = describeHand(spot.board, comboC1[id], comboC2[id]);
    let best = 0;
    for (let a = 1; a < nA; a++) if (spot.solution.ev[l.k * nA + a] > spot.solution.ev[l.k * nA + best]) best = a;
    let mine = 0;
    for (let a = 1; a < nA; a++) if (user[l.k * nA + a] > user[l.k * nA + mine]) mine = a;
    out.push({
      icon: '🩹',
      text: `${comboPretty(id)} (${d.label}): you chose ${spot.actions[mine].short}, but ${spot.actions[best].short} earns ${bb(l.lossBb, 2)} more.`,
      tone: 'warn',
    });
  }
  return out;
}

export function explainHand(spot: SpotPackage, hand: HandResult): string[] {
  const nA = spot.actions.length;
  const k = hand.k;
  const id = spot.hero.combos[k];
  const d = describeHand(spot.board, comboC1[id], comboC2[id]);
  const eq = spot.hero.equity[k];
  const best = spot.actions[hand.best];
  const lines: string[] = [];
  lines.push(`${comboPretty(id)}: ${d.label}, with ${pct(eq)} equity against villain's whole range.`);
  const mix = spot.actions
    .map((a, i) => ({ a, p: spot.solution.strategy[k * nA + i] }))
    .filter((x) => x.p >= 0.05)
    .sort((x, y) => y.p - x.p);
  if (mix.length > 1) lines.push(`${spot.solution.mode === 'gto' ? 'The solver mixes' : 'Best options'}: ${mix.map((x) => `${x.a.short} ${pct(x.p)}`).join(', ')} — mixed actions have near-equal EV, so any of them is fine.`);
  else if (mix.length) lines.push(`${spot.solution.mode === 'gto' ? 'The solver' : 'The best exploit'} plays ${mix[0].a.short} here ${pct(mix[0].p)} of the time.`);
  if (best.aggressive) {
    const ce = spot.solution.contEq[k * nA + hand.best];
    const fold = spot.solution.villainFold[hand.best];
    if (ce >= 0.5) lines.push(`${best.short} is a value bet: you beat ${pct(ce)} of the hands that continue.`);
    else lines.push(`${best.short} works as a bluff: villain folds ${pct(fold)} of the time, and your hand rarely wins at showdown (${pct(eq)}).`);
  } else if ((best.key === 'call' || best.key === 'fold') && Math.abs(eq - spot.theory.requiredEquity) < 0.03) {
    lines.push(`This hand has almost exactly the ${pct(spot.theory.requiredEquity)} equity a call needs, which is why calling and folding are close.`);
  } else if (best.key === 'call') {
    lines.push(`Calling needs ${pct(spot.theory.requiredEquity)} equity; this hand has ${pct(eq)} against their betting range.`);
  } else if (best.key === 'fold') {
    lines.push(`You need ${pct(spot.theory.requiredEquity)} equity to call, but this hand only has ${pct(eq)}.`);
  } else if (best.key === 'check') {
    lines.push(`Checking keeps the pot small: worse hands won't call a bet and better ones won't fold.`);
  }
  return lines;
}
