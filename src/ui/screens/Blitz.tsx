import { useCallback, useEffect, useRef, useState } from 'react';
import { BUCKETS, bucketOf, gradeHand, type HandResult } from '../../engine/analysis';
import { comboC1, comboC2 } from '../../engine/combos';
import { describeHand } from '../../engine/handinfo';
import { randomSeed } from '../../engine/rng';
import { NODE_TYPES, NODE_TYPE_INFO, type SpotPackage, type SpotRequest } from '../../engine/types';
import { levelFromXp } from '../../learning/progress';
import { unlockedFamilies } from '../../learning/families';
import { parseFamily } from '../../engine/types';
import { achievementById } from '../../learning/achievements';
import { useStore, useToasts } from '../../state/store';
import { engine } from '../../worker/client';
import { CardBack, CardText, PlayingCard } from '../components/Cards';
import { Ring } from '../components/Charts';
import { celebrate } from '../components/Overlays';
import { useFelt } from '../components/TablePanels';
import { useNav } from '../nav';
import { sfx } from '../sound';
import { ACTION_COLOR, bb, pct } from '../util';

const DURATION = 180_000;
const MAX_STRIKES = 3;

interface Item {
  spot: SpotPackage;
  k: number;
  difficulty: number;
}

interface Answer {
  item: Item;
  hand: HandResult;
  ms: number;
}

function itemDifficulty(spot: SpotPackage, k: number): number {
  const nA = spot.actions.length;
  let best = 0;
  for (let a = 1; a < nA; a++) if (spot.solution.ev[k * nA + a] > spot.solution.ev[k * nA + best]) best = a;
  const key = spot.actions[best].key;
  const eq = spot.hero.equity[k];
  let d = 950 + 300 * spot.difficulty;
  if (spot.actions[best].aggressive && eq < 0.3) d += 220;
  if (key === 'call' && eq < 0.4) d += 200;
  if (key === 'fold' && eq > 0.45) d += 200;
  if (key === 'check' && eq > 0.75) d += 150;
  let maxP = 0;
  for (let a = 0; a < nA; a++) maxP = Math.max(maxP, spot.solution.strategy[k * nA + a]);
  if (maxP < 0.7) d -= 90;
  return d;
}

/** Deal up to three different hands from one solved spot, preferring ones near the player's rating. */
function dealItems(spot: SpotPackage, rating: number): Item[] {
  const cands: Item[] = [];
  for (let t = 0; t < 14; t++) {
    let total = 0;
    for (const w of spot.hero.weights) total += w;
    let x = Math.random() * total;
    let k = 0;
    for (; k < spot.hero.n - 1; k++) {
      x -= spot.hero.weights[k];
      if (x <= 0) break;
    }
    if (cands.some((c) => c.k === k)) continue;
    cands.push({ spot, k, difficulty: itemDifficulty(spot, k) });
  }
  return cands.sort((a, b) => Math.abs(a.difficulty - rating) - Math.abs(b.difficulty - rating)).slice(0, 3);
}

function blitzRequest(): SpotRequest {
  const s = useStore.getState();
  const fams = unlockedFamilies(levelFromXp(s.xp).level, s.settings.unlockAll);
  const f = fams[Math.floor(Math.random() * fams.length)];
  const { nodeType, texture } = f ? parseFamily(f) : { nodeType: NODE_TYPES[0], texture: undefined };
  return { seed: randomSeed(), nodeType, texture: Math.random() < 0.5 ? texture : undefined, profile: 'gto' };
}

export function Blitz() {
  const go = useNav((s) => s.go);
  const counters = useStore((s) => s.counters);
  const history = useStore((s) => s.blitz);
  const [phase, setPhase] = useState<'intro' | 'loading' | 'running' | 'over'>('intro');
  const [item, setItem] = useState<Item | null>(null);
  const [score, setScore] = useState(0);
  const [strikes, setStrikes] = useState(0);
  const [streak, setStreak] = useState(0);
  const [rating, setRating] = useState(counters.blitzRating);
  const [startRating, setStartRating] = useState(counters.blitzRating);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [left, setLeft] = useState(DURATION);
  const queue = useRef<Item[]>([]);
  const inflight = useRef<Promise<SpotPackage>[]>([]);
  const startTs = useRef(0);
  const itemTs = useRef(0);
  const ended = useRef(false);
  const ratingRef = useRef(rating);
  const pushToast = useToasts((s) => s.push);

  const topUp = useCallback(() => {
    while (inflight.current.length < 2) {
      const p = engine.generate(blitzRequest(), true);
      inflight.current.push(p);
      p.then((spot) => {
        inflight.current = inflight.current.filter((x) => x !== p);
        queue.current.push(...dealItems(spot, ratingRef.current));
      }).catch(() => {
        inflight.current = inflight.current.filter((x) => x !== p);
      });
    }
  }, []);

  const nextItem = useCallback(async () => {
    topUp();
    while (!queue.current.length) {
      if (ended.current) return;
      await new Promise((r) => setTimeout(r, 80));
      topUp();
    }
    const it = queue.current.shift()!;
    setItem(it);
    itemTs.current = Date.now();
  }, [topUp]);

  const finish = useCallback(
    (finalAnswers: Answer[], finalScore: number) => {
      if (ended.current) return;
      ended.current = true;
      setPhase('over');
      const avgMs = finalAnswers.length ? finalAnswers.reduce((s, a) => s + a.ms, 0) / finalAnswers.length : 0;
      const out = useStore.getState().recordBlitz({ ts: Date.now(), score: finalScore, answered: finalAnswers.length, rating: Math.round(ratingRef.current), avgMs }, 10 + finalScore * 3, finalScore * 2);
      if (finalScore > 0 && finalScore >= useStore.getState().counters.blitzBest) celebrate(1);
      if (out.levelUp) pushToast({ emoji: '🎉', title: `Level ${out.levelUp}!`, tone: 'gold' });
      out.achievements.forEach((id) => {
        const a = achievementById(id);
        if (a) pushToast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc, tone: 'gold' });
      });
    },
    [pushToast],
  );

  const start = useCallback(async () => {
    ended.current = false;
    queue.current = [];
    answersRef.current = [];
    scoreRef.current = 0;
    setScore(0);
    setStrikes(0);
    setStreak(0);
    setAnswers([]);
    setStartRating(useStore.getState().counters.blitzRating);
    ratingRef.current = useStore.getState().counters.blitzRating;
    setRating(ratingRef.current);
    setPhase('loading');
    const first = await engine.generate(blitzRequest());
    queue.current.push(...dealItems(first, ratingRef.current));
    topUp();
    startTs.current = Date.now();
    setLeft(DURATION);
    setPhase('running');
    void nextItem();
  }, [nextItem, topUp]);

  const answersRef = useRef<Answer[]>([]);
  const scoreRef = useRef(0);

  useEffect(() => {
    if (phase !== 'running') return;
    const t = setInterval(() => {
      const l = DURATION - (Date.now() - startTs.current);
      setLeft(Math.max(0, l));
      if (l <= 0) finish(answersRef.current, scoreRef.current);
    }, 250);
    return () => clearInterval(t);
  }, [phase, finish]);

  const answer = useCallback(
    (a: number) => {
      if (!item || phase !== 'running' || flash) return;
      const hand = gradeHand(item.spot, item.k, a);
      const ms = Date.now() - itemTs.current;
      const correct = hand.lossPct <= 1.5;
      const strike = hand.lossPct > 4;
      const result = correct ? 1 : strike ? 0 : 0.5;
      const expected = 1 / (1 + Math.pow(10, (item.difficulty - ratingRef.current) / 400));
      ratingRef.current += 14 * (result - expected);
      setRating(ratingRef.current);
      const nextAnswers = [...answers, { item, hand, ms }];
      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
      const nextScore = score + (correct ? 1 : 0);
      setScore(nextScore);
      scoreRef.current = nextScore;
      setStreak(correct ? streak + 1 : 0);
      const nextStrikes = strikes + (strike ? 1 : 0);
      setStrikes(nextStrikes);
      if (correct) sfx.good();
      else if (strike) sfx.bad();
      else sfx.meh();
      setFlash({
        ok: correct,
        text: correct ? `✓ ${item.spot.actions[a].short}${hand.refFreq < 0.5 && hand.refFreq > 0 ? ' (mixed)' : ''}` : `${strike ? '✗' : '≈'} Best: ${item.spot.actions[hand.best].short} (−${bb(hand.lossBb, 1)})`,
      });
      setTimeout(
        () => {
          setFlash(null);
          if (nextStrikes >= MAX_STRIKES) finish(nextAnswers, nextScore);
          else void nextItem();
        },
        correct ? 450 : 1100,
      );
    },
    [item, phase, flash, answers, score, streak, strikes, finish, nextItem],
  );

  useEffect(() => {
    if (phase !== 'running') return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (item && n >= 1 && n <= item.spot.actions.length) answer(n - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, item, answer]);

  useEffect(() => () => void (ended.current = true), []);

  if (phase === 'intro')
    return (
      <div className="col" style={{ gap: 18, maxWidth: 820, margin: '0 auto' }}>
        <div className="hero-card">
          <span className="deco">⚡</span>
          <h1>Blitz</h1>
          <p>Three minutes. Three strikes. You see the villain's range and action plus your hand; pick the action fast. Good or better scores a point; a mistake or blunder is a strike.</p>
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            <button className="btn big" onClick={() => void start()}>
              ▶ Start a run
            </button>
          </div>
        </div>
        <div className="statgrid">
          <div className="stat-tile">
            <div className="k">Personal best</div>
            <div className="v">{counters.blitzBest}</div>
          </div>
          <div className="stat-tile">
            <div className="k">Blitz rating</div>
            <div className="v">{Math.round(counters.blitzRating)}</div>
          </div>
          <div className="stat-tile">
            <div className="k">Runs</div>
            <div className="v">{counters.blitzRuns}</div>
          </div>
        </div>
        <div className="panel">
          <h3>Why speed drills?</h3>
          <p className="small muted" style={{ margin: 0 }}>
            Experts don't calculate everything; they recognise patterns instantly. Short, rapid classification trials (like Kellman's perceptual-learning modules) build that fluency. Blitz
            complements range building: build slowly in Training, recognise quickly here. Missed hands are listed at the end so you can rebuild those spots slowly.
          </p>
        </div>
        {history.length > 0 && (
          <div className="panel">
            <h3>Recent runs</h3>
            {history.slice(0, 6).map((h) => (
              <div key={h.ts} className="row small" style={{ padding: '4px 0', borderBottom: '1px dashed var(--line)' }}>
                <b className="num">{h.score}</b>
                <span className="muted">
                  {h.answered} answered · {(h.avgMs / 1000).toFixed(1)}s each
                </span>
                <span className="spacer" />
                <span className="num">rating {h.rating}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );

  if (phase === 'loading' || (phase === 'running' && !item))
    return (
      <div className="loading-den">
        <div>
          <div className="shuffle">
            <CardBack size={52} />
            <CardBack size={52} />
            <CardBack size={52} />
          </div>
          <h3>Warming up the solver…</h3>
        </div>
      </div>
    );

  if (phase === 'over') {
    const misses = answers.filter((a) => a.hand.lossPct > 1.5);
    const best = counters.blitzBest;
    const delta = Math.round(rating - startRating);
    return (
      <div className="col" style={{ gap: 16, maxWidth: 860, margin: '0 auto' }}>
        <div className="panel center">
          <div style={{ fontSize: '3rem' }}>{score >= best && score > 0 ? '🏆' : '⚡'}</div>
          <h1 style={{ marginBottom: 0 }}>{score} points</h1>
          <p className="muted">
            {answers.length} hands · {pct(answers.length ? score / answers.length : 0)} correct · rating {Math.round(rating)} ({delta >= 0 ? '+' : ''}
            {delta}){score >= best && score > 0 ? ' · new personal best!' : ''}
          </p>
          <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
            <button className="btn big" onClick={() => void start()}>
              ↻ Again
            </button>
            <button className="btn secondary" onClick={() => go('home')}>
              Back to the Den
            </button>
          </div>
        </div>
        <div className="panel">
          <h3>Review your misses ({misses.length})</h3>
          <p className="small muted">Speed comes from understanding. Rebuild a missed spot slowly to see the whole range.</p>
          {misses.length === 0 && <div className="empty">Flawless run! ✨</div>}
          {misses.map((m, i) => {
            const id = m.item.spot.hero.combos[m.item.k];
            const d = describeHand(m.item.spot.board, comboC1[id], comboC2[id]);
            return (
              <div key={i} className="scrap">
                <span style={{ fontSize: '1.3rem' }}>{m.hand.lossPct > 4 ? '✗' : '≈'}</span>
                <div className="small">
                  <div>
                    <CardText cards={[comboC1[id], comboC2[id]]} /> on <CardText cards={m.item.spot.board} /> · {NODE_TYPE_INFO[m.item.spot.nodeType].short}
                  </div>
                  <div className="muted">
                    {d.label} · you: <b>{m.item.spot.actions[m.hand.action].short}</b> · best: <b>{m.item.spot.actions[m.hand.best].short}</b> (−{bb(m.hand.lossBb, 2)})
                  </div>
                </div>
                <button className="btn secondary small" onClick={() => go('train', { kind: 'replay', request: m.item.spot.request, title: 'Blitz miss' })}>
                  Rebuild
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return <BlitzItem item={item!} left={left} score={score} strikes={strikes} streak={streak} rating={rating} flash={flash} onAnswer={answer} />;
}

function BlitzItem({
  item,
  left,
  score,
  strikes,
  streak,
  rating,
  flash,
  onAnswer,
}: {
  item: Item;
  left: number;
  score: number;
  strikes: number;
  streak: number;
  rating: number;
  flash: { ok: boolean; text: string } | null;
  onAnswer: (a: number) => void;
}) {
  const [fa, fb] = useFelt();
  const { spot, k } = item;
  const id = spot.hero.combos[k];
  const d = describeHand(spot.board, comboC1[id], comboC2[id]);
  const shares = BUCKETS.map(() => 0);
  for (let j = 0; j < spot.villain.n; j++) shares[bucketOf(spot.villain.equity[j])] += spot.villain.weights[j];
  const total = shares.reduce((a, b) => a + b, 0);
  return (
    <div className="col" style={{ gap: 14, maxWidth: 820, margin: '0 auto' }}>
      <div className="panel row" style={{ gap: 18 }}>
        <Ring value={left / DURATION} size={72} stroke={8} color={left < 30_000 ? 'var(--berry)' : 'var(--honey)'}>
          <span className="num" style={{ fontSize: '1.1rem', fontWeight: 700 }}>
            {Math.ceil(left / 1000)}
          </span>
        </Ring>
        <div>
          <div className="tiny muted" style={{ fontWeight: 800 }}>
            SCORE
          </div>
          <div className="num" style={{ fontSize: '2rem', lineHeight: 1 }}>
            {score}
          </div>
        </div>
        <div>
          <div className="tiny muted" style={{ fontWeight: 800 }}>
            STRIKES
          </div>
          <div className="strikes">
            {Array.from({ length: MAX_STRIKES }, (_, i) => (
              <span key={i} style={{ opacity: i < MAX_STRIKES - strikes ? 1 : 0.2 }}>
                ❤️
              </span>
            ))}
          </div>
        </div>
        <div className="spacer" />
        {streak >= 3 && <span className="tag honey">🔥 {streak} in a row</span>}
        <span className="tag">rating {Math.round(rating)}</span>
      </div>

      <div key={`${spot.id}-${k}`} className={`panel${flash ? ` blitz-flash${flash.ok ? '' : ' bad'}` : ''}`}>
        <div className="felt" style={{ ['--felt-a' as string]: fa, ['--felt-b' as string]: fb }}>
          <div className="row tiny" style={{ fontWeight: 800, opacity: 0.85 }}>
            <span>
              {spot.scenario.name} · You are {spot.heroPos}
            </span>
            <span className="spacer" />
            <span>{NODE_TYPE_INFO[spot.nodeType].short}</span>
          </div>
          <div className="board">
            {spot.board.map((c, i) => (
              <PlayingCard key={i} card={c} size={42} />
            ))}
          </div>
          <div className="pot">
            Pot {bb(spot.pot)}
            {spot.toCall > 0 && <small> · {bb(spot.toCall)} to call</small>}
          </div>
        </div>
        <div className="action-callout">
          <span>{spot.villainAction.kind === 'check' ? '✋' : spot.villainAction.kind === 'none' ? '⏳' : '💰'}</span>
          <span>
            {spot.heroPrior && <span className="muted small">{spot.heroPrior}. </span>}
            {spot.villainAction.label}
          </span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div className="compbar">
            {BUCKETS.map((b, i) =>
              shares[i] > 0 ? (
                <div key={b.key} style={{ width: `${(shares[i] / total) * 100}%`, background: b.color }}>
                  {shares[i] / total > 0.12 ? `${b.label} ${pct(shares[i] / total)}` : ''}
                </div>
              ) : null,
            )}
          </div>
          <div className="tiny muted" style={{ marginTop: 4 }}>
            Villain's range by strength vs yours
          </div>
        </div>
        <div className="reveal" style={{ padding: '14px 0 0' }}>
          <div className="hand">
            <PlayingCard card={comboC1[id]} size={60} />
            <PlayingCard card={comboC2[id]} size={60} />
          </div>
          <div className="small">
            <b>{d.label}</b> · {pct(spot.hero.equity[k])} equity vs their range
          </div>
          {flash ? (
            <h2 style={{ color: flash.ok ? 'var(--sage-d)' : 'var(--berry)', margin: 0 }}>{flash.text}</h2>
          ) : (
            <div className="choice-row">
              {spot.actions.map((a, i) => (
                <button key={i} className="choice" style={{ ['--c' as string]: ACTION_COLOR[a.key] }} onClick={() => onAnswer(i)}>
                  {a.short}
                  <small>{i + 1}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
