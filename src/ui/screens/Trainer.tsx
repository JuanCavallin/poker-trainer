import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultActionIndex,
  detectFinds,
  gradeHand,
  newStrategy,
  resolveStrategy,
  rowSum,
  scoreRange,
  type FindId,
  type HandResult,
  type RangeScore,
} from '../../engine/analysis';
import { cardPretty } from '../../engine/cards';
import { comboC1, comboC2 } from '../../engine/combos';
import { PROFILE_IDS, PROFILES } from '../../engine/profiles';
import { randomSeed } from '../../engine/rng';
import { sameSpotRequest } from '../../engine/requests';
import { classifyTexture } from '../../engine/texture';
import type { Position } from '../../engine/seats';
import { NODE_TYPE_INFO, STREET_LABEL, type SpotPackage, type SpotRequest, type Street } from '../../engine/types';
import { familyLabel, focusStreets, seatPref } from '../../learning/families';
import { levelFromXp } from '../../learning/progress';
import { nextDrill, nextRegular, nextReview } from '../../learning/selector';
import { achievementById } from '../../learning/achievements';
import { useStore, useToasts, type Outcome } from '../../state/store';
import type { AttemptRecord, Confidence, SessionKind } from '../../state/types';
import { engine } from '../../worker/client';
import { BrushBar, CategoryPanel, StrengthLadder, brushMix, type Brush } from '../components/BuildTools';
import { CardPicker } from '../components/CardPicker';
import { CardBack } from '../components/Cards';
import { Feedback, type TwinContext } from '../components/Feedback';
import { ComboInspector } from '../components/Inspector';
import { MetricsPanel } from '../components/MetricsPanel';
import { celebrate } from '../components/Overlays';
import { RangeGrid } from '../components/RangeGrid';
import { HandReveal } from '../components/Reveal';
import { HistoryPanel, TablePanel, VillainPanel, nextStreetName } from '../components/TablePanels';
import { useNav, type SessionConfig } from '../nav';
import { sfx } from '../sound';
import { formatMs, pct } from '../util';

type Phase = 'loading' | 'build' | 'reveal' | 'feedback' | 'done' | 'error';

interface Planned {
  req: SpotRequest;
  kind: SessionKind;
}

const BUBBLES_GOOD = ['Purr-fect! 🐾', 'Lovely play!', 'Ooh, sharp!', 'That felt right ✨', 'Cozy and correct.'];
const BUBBLES_OK = ['Nice!', 'Close enough to smile at.', 'Solid.', 'Good instincts.'];
const BUBBLES_BAD = ['Hmm, peek at the insights?', 'Oof. Happens to the best of us.', "Let's learn from this one.", 'Tricky spot!'];
const pickOne = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

function sampleWeighted(weights: Float32Array): number {
  let total = 0;
  for (const w of weights) total += w;
  let x = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x <= 0) return i;
  }
  return weights.length - 1;
}

export function Trainer({ session }: { session: SessionConfig }) {
  const go = useNav((s) => s.go);
  const settings = useStore((s) => s.settings);
  const families = useStore((s) => s.families);
  const woodpecker = useStore((s) => s.woodpecker);
  const pushToast = useToasts((s) => s.push);

  const [spot, setSpot] = useState<SpotPackage | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [strategy, setStrategy] = useState<Float32Array>(new Float32Array(0));
  const [brush, setBrush] = useState<Brush>({ primary: 0, secondary: null, split: 0.5, erase: false });
  const [inspect, setInspect] = useState(false);
  const [inspectCls, setInspectCls] = useState<number | null>(null);
  const [startTs, setStartTs] = useState(Date.now());
  const [buildMs, setBuildMs] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [confidence, setConfidence] = useState<Confidence | undefined>();
  const [dealt, setDealt] = useState(0);
  const [resolved, setResolved] = useState<Float32Array | null>(null);
  const [score, setScore] = useState<RangeScore | null>(null);
  const [hand, setHand] = useState<HandResult | null>(null);
  const [finds, setFinds] = useState<FindId[]>([]);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);
  const [twin, setTwin] = useState<TwinContext | null>(null);
  const [kind, setKind] = useState<SessionKind>('regular');
  const [attemptMs, setAttemptMs] = useState(0);
  const [pendingStreet, setPendingStreet] = useState<Street>('river');
  const [picking, setPicking] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);
  const [, setHistVersion] = useState(0);

  const undoStack = useRef<Float32Array[]>([]);
  const redoStack = useRef<Float32Array[]>([]);
  const strokeBase = useRef<Float32Array | null>(null);
  const exploitPromise = useRef<Promise<number | null> | null>(null);
  const sessionIdx = useRef(0);
  const relearn = useRef<{ family: string; at: number }[]>([]);
  const lastReq = useRef<SpotRequest | undefined>(undefined);
  const lastFamily = useRef<string | undefined>(undefined);
  const prefetched = useRef<{ planned: Planned; promise: Promise<SpotPackage> } | null>(null);
  const lastPaintSound = useRef(0);

  const wood = session.kind === 'woodpecker' ? woodpecker.find((w) => w.id === session.setId) : undefined;

  // ------------------------------------------------------------------ planning
  const plan = useCallback((): Planned | null => {
    const s = useStore.getState();
    const nowTs = Date.now();
    const seats = seatPref(s.settings);
    if (session.kind === 'regular') {
      const pick = nextRegular({
        families: s.families,
        level: levelFromXp(s.xp).level,
        unlockAll: s.settings.unlockAll,
        recent: s.history.slice(0, 10),
        relearn: relearn.current,
        sessionIndex: sessionIdx.current,
        now: nowTs,
        streets: focusStreets(s.settings.focus),
        seats,
      });
      if (pick.relearnFamily) relearn.current = relearn.current.filter((r) => r.family !== pick.relearnFamily);
      return { req: pick.request, kind: pick.reason === 'due' ? 'review' : 'regular' };
    }
    if (session.kind === 'drill') return { req: nextDrill(session.filters, sessionIdx.current, lastReq.current), kind: 'drill' };
    if (session.kind === 'review') {
      const req = nextReview(s.families, nowTs, lastFamily.current, seats);
      return req ? { req, kind: 'review' } : null;
    }
    if (session.kind === 'woodpecker') {
      const set = s.woodpecker.find((w) => w.id === session.setId);
      if (!set) return null;
      const cycle = set.cycles[set.cycles.length - 1];
      const i = cycle ? cycle.results.length : 0;
      if (!cycle || cycle.finishedAt || i >= set.spots.length) return null;
      const req = { ...set.spots[cycle.perm[i]] };
      if (set.mode === 'mirror' && set.cycles.length > 1 && req.street !== 'preflop') {
        const p = [0, 1, 2, 3];
        const r = (set.cycles.length * 7 + i) % 24;
        // Deterministic per-cycle suit shuffle so each cycle looks fresh but is strategically identical.
        for (let i = 3, x = r; i > 0; i--) {
          const j = x % (i + 1);
          x = Math.floor(x / (i + 1));
          [p[i], p[j]] = [p[j], p[i]];
        }
        if (p.some((v, i) => v !== i)) req.suitPerm = p;
      }
      return { req, kind: 'woodpecker' };
    }
    if (session.kind === 'replay') return sessionIdx.current === 0 ? { req: session.request, kind: 'replay' } : null;
    return null;
  }, [session]);

  const startSpot = useCallback(
    (s: SpotPackage, k: SessionKind, initial?: Float32Array, keepClock = false) => {
      setSpot(s);
      setKind(k);
      const nA = s.actions.length;
      setStrategy(initial ?? newStrategy(s));
      undoStack.current = [];
      redoStack.current = [];
      const facing = s.toCall > 0;
      const prim = facing ? s.actions.findIndex((a) => a.key === 'call') : s.actions.findIndex((a) => a.key === 'big' || a.key === 'small' || a.key === 'allin');
      setBrush({ primary: Math.max(0, Math.min(nA - 1, prim)), secondary: null, split: 0.5, erase: false });
      setInspect(false);
      setInspectCls(null);
      setScore(null);
      setHand(null);
      setFinds([]);
      setOutcome(null);
      setResolved(null);
      setConfidence(undefined);
      if (!keepClock) setStartTs(Date.now());
      setPhase('build');
      lastReq.current = s.request;
      const fam = useStore.getState().families[s.family];
      const hintsOn = settingsHints(useStore.getState().settings.hints, fam?.mastery ?? 0, fam?.reps ?? 0);
      if (hintsOn) setBubble(openingHint(s));
      else setBubble(Math.random() < 0.3 ? pickOne(['Take your time ☕', 'What does their range look like?', 'Think in ranges, not hands.']) : null);
    },
    [],
  );

  const loadNext = useCallback(async () => {
    setPhase('loading');
    setTwin(null);
    let item = prefetched.current;
    prefetched.current = null;
    if (!item) {
      const planned = plan();
      if (!planned) {
        setPhase('done');
        return;
      }
      item = { planned, promise: engine.generate(planned.req) };
    }
    setPendingStreet(item.planned.req.street ?? 'river');
    try {
      const s = await item.promise;
      startSpot(s, item.planned.kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [plan, startSpot]);

  const prefetch = useCallback(() => {
    if (prefetched.current) return;
    const planned = plan();
    if (!planned) return;
    const promise = engine.generate(planned.req, true);
    promise.catch(() => undefined);
    prefetched.current = { planned, promise };
  }, [plan]);

  const started = useRef(false);
  useEffect(() => {
    // StrictMode runs mount effects twice in development; deal only once.
    if (started.current) return;
    started.current = true;
    void loadNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase !== 'build') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // ------------------------------------------------------------------ painting
  const nA = spot?.actions.length ?? 0;

  const paint = useCallback(
    (members: number[], erase: boolean, explicitMix?: number[] | null) => {
      setStrategy((prev) => {
        if (!strokeBase.current) strokeBase.current = prev;
        const next = Float32Array.from(prev);
        const mix = explicitMix !== undefined ? explicitMix : erase || brush.erase ? null : brushMix(brush, nA);
        for (const k of members) for (let a = 0; a < nA; a++) next[k * nA + a] = mix ? mix[a] : 0;
        return next;
      });
      const t = Date.now();
      if (t - lastPaintSound.current > 70) {
        sfx.paint();
        lastPaintSound.current = t;
      }
    },
    [brush, nA],
  );

  const endStroke = useCallback(() => {
    if (strokeBase.current) {
      undoStack.current.push(strokeBase.current);
      if (undoStack.current.length > 60) undoStack.current.shift();
      redoStack.current = [];
      strokeBase.current = null;
      setHistVersion((v) => v + 1);
    }
  }, []);

  const paintOnce = useCallback(
    (members: number[], erase = false, mix?: number[] | null) => {
      paint(members, erase, mix);
      setTimeout(endStroke, 0);
    },
    [paint, endStroke],
  );

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setStrategy((cur) => {
      redoStack.current.push(cur);
      return prev;
    });
    setHistVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const nxt = redoStack.current.pop();
    if (!nxt) return;
    setStrategy((cur) => {
      undoStack.current.push(cur);
      return nxt;
    });
    setHistVersion((v) => v + 1);
  }, []);

  const fillRest = useCallback(() => {
    if (!spot) return;
    const members: number[] = [];
    for (let k = 0; k < spot.hero.n; k++) if (rowSum(strategy, k, nA) <= 1e-9) members.push(k);
    if (members.length) paintOnce(members, false);
  }, [spot, strategy, nA, paintOnce]);

  const clearAll = useCallback(() => {
    if (!spot) return;
    paintOnce(
      Array.from({ length: spot.hero.n }, (_, k) => k),
      true,
      null,
    );
  }, [spot, paintOnce]);

  // ------------------------------------------------------------------ lock-in & confirm
  const lockIn = useCallback(
    (conf?: Confidence) => {
      if (!spot) return;
      const res = resolveStrategy(spot, strategy);
      setResolved(res);
      setConfidence(conf);
      setBuildMs(Date.now() - startTs);
      setDealt(sampleWeighted(spot.hero.weights));
      setPhase('reveal');
      setBubble(null);
      sfx.flip();
      exploitPromise.current = spot.solution.balance ? engine.exploitability(spot, res).catch(() => null) : Promise.resolve(null);
    },
    [spot, strategy, startTs],
  );

  const confirm = useCallback(
    async (action: number) => {
      if (!spot || !resolved) return;
      sfx.chip();
      const expl = await (exploitPromise.current ?? Promise.resolve(null));
      const sc = scoreRange(spot, resolved, expl);
      const hr = gradeHand(spot, dealt, action);
      const fs = detectFinds(spot, hr);
      // Decision time = how long the range build took (the reveal is just a confirmation).
      const ms = buildMs;
      const tex = classifyTexture(spot.board);
      const rec: AttemptRecord = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        ts: Date.now(),
        kind,
        family: spot.family,
        nodeType: spot.nodeType,
        texture: tex.id,
        profile: spot.profile,
        scenarioId: spot.scenario.id,
        potType: spot.scenario.potType,
        street: spot.street,
        heroPos: spot.heroPos,
        villainPos: spot.villainPos,
        request: spot.request,
        score: sc.score,
        accuracy: sc.accuracy,
        balance: sc.balance,
        evLossPct: sc.evLossPct,
        exploitPct: sc.exploitPct,
        matchPct: sc.matchPct,
        hand: { combo: spot.hero.combos[dealt], action: spot.actions[action].short, grade: hr.grade, lossPct: hr.lossPct },
        ms,
        confidence,
        tendencies: sc.tendencies,
        capture: sc.capture,
        finds: fs,
        difficulty: spot.difficulty,
      };
      const facing = spot.toCall > 0;
      const contOf = (f: number[]) => f.reduce((s, v, a) => (spot.actions[a].key !== 'fold' ? s + v : s), 0);
      const mdfHit = facing && Math.abs(contOf(sc.userFreq) - contOf(sc.refFreq)) <= 0.05;
      const balanceHit = spot.actions.some(
        (a, i) => a.aggressive && sc.userFreq[i] >= 0.04 && sc.refFreq[i] >= 0.04 && Number.isFinite(sc.userBluff[i]) && Number.isFinite(sc.refBluff[i]) && Math.abs(sc.userBluff[i] - sc.refBluff[i]) <= 0.05,
      );
      const out = useStore.getState().recordAttempt(rec, { balanceHit, mdfHit, board: spot.board });

      if (sc.score < 55 || (confidence === 'sure' && sc.score < 65)) relearn.current.push({ family: spot.family, at: sessionIdx.current });
      lastFamily.current = spot.family;
      sessionIdx.current += 1;

      if (session.kind === 'woodpecker') {
        const st = useStore.getState();
        let finished = false;
        st.updateWoodpecker(session.setId, (w) => {
          const cycles = w.cycles.slice();
          const cur = { ...cycles[cycles.length - 1] };
          cur.results = [...cur.results, { score: sc.score, ms }];
          if (cur.results.length >= w.spots.length) {
            cur.finishedAt = Date.now();
            finished = true;
          }
          cycles[cycles.length - 1] = cur;
          return { ...w, cycles };
        });
        if (finished) {
          const co = st.completeCycle();
          pushToast({ emoji: '🐦', title: 'Woodpecker cycle complete!', body: `+${co.xp} XP · +${co.chips} chips`, tone: 'gold' });
          co.achievements.forEach((id) => {
            const a = achievementById(id);
            if (a) pushToast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc, tone: 'gold' });
          });
        }
      }

      setScore(sc);
      setHand(hr);
      setFinds(fs);
      setOutcome(out);
      setAttemptMs(ms);
      setPhase('feedback');
      window.scrollTo({ top: 0, behavior: 'smooth' });

      const tone = hr.grade === 'Perfect' || hr.grade === 'Great' ? 'good' : hr.grade === 'Good' ? 'ok' : 'bad';
      setBubble(tone === 'good' ? pickOne(BUBBLES_GOOD) : tone === 'ok' ? pickOne(BUBBLES_OK) : pickOne(BUBBLES_BAD));
      if (sc.score >= 90 || fs.length) {
        sfx.great();
        celebrate(fs.length ? 1.2 : 0.7);
      } else if (tone === 'bad') sfx.bad();
      else sfx.good();
      if (out.levelUp) {
        setTimeout(() => {
          sfx.level();
          celebrate(1.6);
        }, 500);
        pushToast({ emoji: '🎉', title: `Level ${out.levelUp}!`, body: 'New spots and villains may have unlocked.', tone: 'gold' });
      }
      out.achievements.forEach((id) => {
        const a = achievementById(id);
        if (a) pushToast({ emoji: a.emoji, title: `Achievement: ${a.name}`, body: a.desc, tone: 'gold' });
      });
      if (out.quests.length) pushToast({ emoji: '📜', title: 'Daily quest complete!', body: 'Claim the reward in the Den.', tone: 'green' });

      prefetch();
    },
    [spot, resolved, dealt, buildMs, kind, confidence, session, pushToast, prefetch],
  );

  const playTwin = useCallback(
    async (which: 'card' | 'villain') => {
      if (!spot) return;
      const base: SpotRequest = {
        seed: randomSeed(),
        street: spot.street,
        nodeType: spot.nodeType,
        profile: spot.profile,
        heroPos: spot.heroPos as Position,
        villainPos: spot.villainPos as Position,
        potType: spot.scenario.potType === '3BP' ? '3BP' : 'SRP',
        lineSeed: spot.lineSeed,
        villainFrac: spot.villainAction.frac || undefined,
      };
      let req: SpotRequest;
      let label: string;
      if (which === 'card' && spot.board.length) {
        const keep = spot.board.slice(0, -1);
        const used = new Set(spot.board);
        let card = -1;
        for (let tries = 0; tries < 60; tries++) {
          const c = Math.floor(Math.random() * 52);
          if (used.has(c)) continue;
          card = c;
          if (classifyTexture([...keep, c]).id !== spot.texture.id) break;
        }
        req = { ...base, board: [...keep, card] };
        label = `Same line, new ${STREET_LABEL[spot.street].toLowerCase()} card`;
      } else {
        const options = PROFILE_IDS.filter((p) => p !== spot.profile);
        const prof = spot.profile === 'gto' ? options[1 + Math.floor(Math.random() * (options.length - 1))] : 'gto';
        req = { ...base, seed: spot.request.seed, profile: prof, board: spot.board.length ? spot.board : undefined };
        label = `Same spot vs ${PROFILES[prof].name}`;
      }
      const prev = spot;
      setPendingStreet(spot.street);
      setPhase('loading');
      try {
        const s = await engine.generate(req);
        startSpot(s, 'twin');
        setTwin({ spot: prev, label });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      }
    },
    [spot, startSpot],
  );

  /**
   * Re-solves this spot assuming a different next card (turn on the flop, river on the turn). From the
   * build phase your painting carries over; from feedback you go back to building with your locked
   * range pre-painted, and the new feedback compares both cards.
   */
  const resolveFor = useCallback(
    async (card: number) => {
      if (!spot || card === spot.nextCard) return;
      setPicking(false);
      const prev = spot;
      const fromFeedback = phase === 'feedback';
      const carried = fromFeedback ? resolved : strategy;
      const label = `${nextStreetName(prev)} ${prev.nextCard != null ? cardPretty(prev.nextCard) : '?'} → ${cardPretty(card)}`;
      setResolving(label);
      setPendingStreet(spot.street);
      setPhase('loading');
      try {
        const s = await engine.generate(sameSpotRequest(prev, { nextCard: card }));
        // Carry the painting over combo by combo (hands holding the new card drop out).
        const nA = s.actions.length;
        const init = newStrategy(s);
        if (carried && carried.length === prev.hero.n * prev.actions.length && nA === prev.actions.length) {
          const rowOf = new Map<number, number>();
          for (let k = 0; k < prev.hero.n; k++) rowOf.set(prev.hero.combos[k], k);
          for (let k = 0; k < s.hero.n; k++) {
            const j = rowOf.get(s.hero.combos[k]);
            if (j != null) for (let a = 0; a < nA; a++) init[k * nA + a] = carried[j * nA + a];
          }
        }
        startSpot(s, fromFeedback ? 'twin' : kind, init, !fromFeedback);
        if (fromFeedback) setTwin({ spot: prev, label: `Same spot, ${label}` });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase('error');
      } finally {
        setResolving(null);
      }
    },
    [spot, phase, resolved, strategy, kind, startSpot],
  );

  // ------------------------------------------------------------------ keyboard
  useEffect(() => {
    if (phase !== 'build' || !spot) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const n = Number(e.key);
      if (n >= 1 && n <= nA) {
        setInspect(false);
        if (e.shiftKey) setBrush((b) => ({ ...b, secondary: n - 1 === b.primary ? null : n - 1, erase: false }));
        else setBrush((b) => ({ ...b, primary: n - 1, secondary: b.secondary === n - 1 ? null : b.secondary, erase: false }));
      } else if (e.code && e.code.startsWith('Digit') && e.shiftKey) {
        const d = Number(e.code.slice(5));
        if (d >= 1 && d <= nA) setBrush((b) => ({ ...b, secondary: d - 1 === b.primary ? null : d - 1, erase: false }));
      } else if (e.key === 'e' || e.key === 'E') setBrush((b) => ({ ...b, erase: !b.erase }));
      else if (e.key === 'i' || e.key === 'I') setInspect((v) => !v);
      else if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.key === 'y' || e.key === 'Y' || ((e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        e.preventDefault();
        redo();
      } else if (e.key === 'f' || e.key === 'F') fillRest();
      else if (e.key === 'Enter') {
        e.preventDefault();
        lockIn(settings.confidence ? 'fair' : undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, spot, nA, undo, redo, fillRest, lockIn, settings.confidence]);

  // ------------------------------------------------------------------ render
  const fam = spot ? families[spot.family] : undefined;
  const showTheory = settingsHints(settings.hints, fam?.mastery ?? 0, fam?.reps ?? 0);
  const title = useMemo(() => {
    if (session.kind === 'drill') return `🧪 ${session.title}`;
    if (session.kind === 'review') return '💧 Watering the garden';
    if (session.kind === 'woodpecker') return `🐦 ${wood?.name ?? 'Woodpecker'}`;
    if (session.kind === 'replay') return `🎞️ ${session.title ?? 'Replay'}`;
    return '🎯 Training';
  }, [session, wood]);

  const unassigned = useMemo(() => {
    if (!spot) return 0;
    let u = 0;
    for (let k = 0; k < spot.hero.n; k++) if (rowSum(strategy, k, nA) <= 1e-9) u += spot.hero.weights[k];
    return u;
  }, [spot, strategy, nA]);

  const dealtCombo = spot && (phase === 'reveal' || phase === 'feedback') ? spot.hero.combos[dealt] : undefined;
  const woodCycle = wood?.cycles[wood.cycles.length - 1];
  const woodDone = woodCycle ? woodCycle.results.length : 0;
  const nextLabel = session.kind === 'woodpecker' && wood && woodDone >= wood.spots.length ? 'Finish cycle' : session.kind === 'replay' ? 'Done' : 'Next spot';

  if (phase === 'error')
    return (
      <div className="loading-den">
        <div className="panel" style={{ maxWidth: 480 }}>
          <h2>🙈 Couldn't deal that spot</h2>
          <p className="muted">{error}</p>
          <div className="row">
            <button className="btn" onClick={() => void loadNext()}>
              Try another
            </button>
            <button className="btn secondary" onClick={() => go('home')}>
              Back to the Den
            </button>
          </div>
        </div>
      </div>
    );

  if (phase === 'done') return <SessionDone session={session} />;

  return (
    <div>
      <div className="spot-header">
        <h2>{title}</h2>
        {spot && phase !== 'loading' && (
          <>
            <span className="tag honey">{familyLabel(spot.family).full}</span>
            <span className="tag">
              You {spot.heroPos} vs {spot.villainPos}
            </span>
            {kind === 'review' && <span className="tag sky">💧 review</span>}
            {kind === 'twin' && <span className="tag sky">👯 twin</span>}
            {session.kind === 'woodpecker' && wood && (
              <span className="tag">
                cycle {wood.cycles.length} · {Math.min(woodDone + (phase === 'feedback' ? 0 : 1), wood.spots.length)}/{wood.spots.length}
              </span>
            )}
          </>
        )}
        <div className="spacer" />
        {phase === 'build' && <span className="muted small num">⏱ {formatMs(Math.max(0, now - startTs))}</span>}
        {phase === 'build' && session.kind !== 'woodpecker' && (
          <button className="btn ghost small" onClick={() => void loadNext()} title="Skip this spot (no penalty)">
            Skip ↷
          </button>
        )}
        <button className="btn ghost small" onClick={() => go('home')}>
          ✕ Leave
        </button>
      </div>

      {(phase === 'loading' || !spot) && (
        <div className="loading-den">
          <div>
            <div className="shuffle">
              <CardBack size={52} />
              <CardBack size={52} />
              <CardBack size={52} />
            </div>
            <h3>{resolving ? `Re-solving for the ${resolving}…` : LOADING_TEXT[pendingStreet]}</h3>
            <p className="muted small">
              {pendingStreet === 'preflop' ? 'Preflop answers come from a solved preflop model.' : 'The solver runs right here in your browser. Earlier streets are solved too, so the ranges are real.'}
            </p>
          </div>
        </div>
      )}

      {spot && phase !== 'loading' && (
        <div className="trainer">
          <div className="left">
            <div className="t-table">
              <TablePanel
                spot={spot}
                bubble={bubble}
                heroCards={dealtCombo != null ? [comboC1[dealtCombo], comboC2[dealtCombo]] : undefined}
                onPickNext={phase === 'build' || (phase === 'feedback' && session.kind !== 'woodpecker') ? () => setPicking(true) : undefined}
              />
            </div>
            <div className="t-villain">
              <VillainPanel spot={spot} />
            </div>
            <div className="t-history">
              <HistoryPanel spot={spot} />
            </div>
          </div>

          <div className="center">
            {phase === 'build' && (
              <>
                <div className="panel t-build">
                  <div className="panel-title">
                    <h3>🎨 Build your range</h3>
                    <div className="spacer" />
                    <span className="muted small">{NODE_TYPE_INFO[spot.nodeType].blurb}</span>
                  </div>
                  <BrushBar
                    spot={spot}
                    brush={brush}
                    setBrush={setBrush}
                    onUndo={undo}
                    onRedo={redo}
                    onClear={clearAll}
                    onFill={fillRest}
                    canUndo={undoStack.current.length > 0}
                    canRedo={redoStack.current.length > 0}
                    inspect={inspect}
                    setInspect={setInspect}
                  />
                  <div style={{ marginTop: 12 }}>
                    <RangeGrid spot={spot} mode="edit" strategy={strategy} onStroke={paint} onStrokeEnd={endStroke} inspectMode={inspect} onInspect={setInspectCls} />
                  </div>
                  <div style={{ marginTop: 12 }}>
                    <div className="small" style={{ fontWeight: 800, marginBottom: 4 }}>
                      Strength ladder
                    </div>
                    <StrengthLadder spot={spot} strategy={strategy} onPaint={(m, erase) => paintOnce(m, erase)} showTheory={showTheory} />
                  </div>
                </div>
                <div className="panel t-paint">
                  <CategoryPanel spot={spot} strategy={strategy} onPaint={(m) => paintOnce(m)} />
                </div>
              </>
            )}

            {phase === 'reveal' && resolved && (
              <>
                <div className="t-reveal">
                  <HandReveal spot={spot} k={dealt} userMix={spot.actions.map((_, a) => resolved[dealt * nA + a])} onConfirm={(a) => void confirm(a)} />
                </div>
                <div className="panel t-reveal-grid">
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Your locked range (your hand's class glows)
                  </div>
                  <RangeGrid spot={spot} mode="user" strategy={resolved} dealtCombo={spot.hero.combos[dealt]} />
                </div>
              </>
            )}

            {phase === 'feedback' && score && hand && resolved && (
              <div className="t-feedback">
              <Feedback
                spot={spot}
                user={resolved}
                score={score}
                exploitPending={false}
                hand={hand}
                finds={finds}
                outcome={outcome}
                ms={attemptMs}
                confidence={confidence}
                twin={twin}
                onNext={() => (session.kind === 'replay' ? go('home') : void loadNext())}
                nextLabel={nextLabel}
                onTwin={session.kind === 'woodpecker' ? undefined : (w) => void playTwin(w)}
                onResolveNext={session.kind === 'woodpecker' ? undefined : () => setPicking(true)}
              />
              </div>
            )}
          </div>

          <div className="right">
            <div className="t-readout">
              <MetricsPanel spot={spot} strategy={phase === 'build' ? strategy : (resolved ?? strategy)} showTheory={showTheory} />
            </div>
            {phase === 'build' && (
              <div className="panel lockin t-lockin">
                <h3 style={{ margin: 0 }}>🔒 Lock in your range</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  Then you're dealt a real hand from your range and confirm your action.
                </p>
                {unassigned > 0.05 && (
                  <div className="small" style={{ color: 'var(--honey-d)', fontWeight: 700 }}>
                    {unassigned.toFixed(1)} combos still unassigned → {spot.actions[defaultActionIndex(spot)].short}
                  </div>
                )}
                {settings.confidence ? (
                  <>
                    <div className="small" style={{ fontWeight: 800 }}>
                      How sure are you?
                    </div>
                    <div className="conf">
                      <button className="btn secondary" onClick={() => lockIn('unsure')}>
                        <span>🤔</span>Guessing
                      </button>
                      <button className="btn secondary" onClick={() => lockIn('fair')}>
                        <span>🙂</span>Fairly sure
                      </button>
                      <button className="btn" onClick={() => lockIn('sure')}>
                        <span>😎</span>Certain
                      </button>
                    </div>
                    <div className="tiny muted">Rating confidence trains calibration; confident misses get re-tested sooner.</div>
                  </>
                ) : (
                  <button className="btn big block" onClick={() => lockIn()}>
                    Lock in <span className="kbd">Enter</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {picking && spot && spot.nextCard != null && (
        <CardPicker
          title={`Solve for another ${nextStreetName(spot)}`}
          blurb={`This ${spot.street} was solved assuming the ${nextStreetName(spot)} is the ${cardPretty(spot.nextCard)}. Pick any other card to re-solve the same spot for it${
            phase === 'build' ? '; your painting is kept' : ' and rebuild your range for it (it starts from the range you locked in)'
          }.`}
          used={spot.board}
          current={spot.nextCard}
          onPick={(c) => void resolveFor(c)}
          onClose={() => setPicking(false)}
        />
      )}

      {inspectCls != null && spot && phase === 'build' && (
        <ComboInspector
          spot={spot}
          cls={inspectCls}
          strategy={strategy}
          brushMix={brushMix(brush, nA)}
          onSet={(ks, mix) => paintOnce(ks, mix === null, mix)}
          onClose={() => setInspectCls(null)}
        />
      )}
    </div>
  );
}

const LOADING_TEXT: Record<Street, string> = {
  preflop: 'Shuffling up a preflop spot…',
  flop: 'Dealing the flop and solving it (a few seconds)…',
  turn: 'Playing the flop, then solving the turn…',
  river: 'Playing the flop and turn, then solving the river…',
};

/** The companion's first hint for a spot, matched to the street. */
function openingHint(s: SpotPackage): string {
  const facing = s.toCall > 0;
  if (s.street === 'preflop') {
    if (s.nodeType === 'rfi') return 'Everyone behind you can still wake up with a hand. Fewer players behind → open wider.';
    return `You need ${pct(s.theory.requiredEquity)} equity to call, but preflop, position and playability matter as much as raw equity.`;
  }
  if (facing) return `Pot odds: you need ${pct(s.theory.requiredEquity)} to call. MDF ≈ ${pct(s.theory.mdf)}.${s.street !== 'river' ? ' Draws still have outs.' : ''}`;
  const big = s.actions.findIndex((a) => a.aggressive);
  if (s.street !== 'river') return 'Before the river, bluffs are semi-bluffs: prefer hands with outs to hands with no equity.';
  return big >= 0 && s.theory.perAction[big] ? `For a ${pct(s.actions[big].frac)} bet, ~${pct(s.theory.perAction[big]!.bluffShare)} bluffs keeps them guessing.` : 'Take your time. The cocoa is warm ☕';
}

export function settingsHints(mode: 'auto' | 'on' | 'off', mastery: number, reps: number): boolean {
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  // Faded scaffolding: guides stay until a family is genuinely mastered.
  return !(reps >= 6 && mastery >= 0.8);
}

function SessionDone({ session }: { session: SessionConfig }) {
  const go = useNav((s) => s.go);
  const wood = useStore((s) => (session.kind === 'woodpecker' ? s.woodpecker.find((w) => w.id === session.setId) : undefined));
  const last = wood?.cycles[wood.cycles.length - 1];
  const avg = last && last.results.length ? last.results.reduce((s, r) => s + r.score, 0) / last.results.length : 0;
  const time = last ? last.results.reduce((s, r) => s + r.ms, 0) : 0;
  return (
    <div className="loading-den">
      <div className="panel" style={{ maxWidth: 520 }}>
        {session.kind === 'review' && (
          <>
            <h2>🌿 Every plant is watered!</h2>
            <p className="muted">Nothing is due right now. Spaced reviews come back just before you'd forget them.</p>
          </>
        )}
        {session.kind === 'woodpecker' && (
          <>
            <h2>🐦 Cycle complete</h2>
            <p>
              Average score <b>{avg.toFixed(0)}</b> in <b>{formatMs(time)}</b>.
            </p>
            <p className="muted small">Woodpecker rhythm: rest at least a day, then run the next cycle aiming for the same accuracy in about half the time.</p>
          </>
        )}
        {session.kind !== 'review' && session.kind !== 'woodpecker' && <h2>✨ All done</h2>}
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn" onClick={() => go('home')}>
            Back to the Den
          </button>
          {session.kind === 'woodpecker' && (
            <button className="btn secondary" onClick={() => go('woodpecker')}>
              Woodpecker sets
            </button>
          )}
          <button className="btn secondary" onClick={() => go('train', { kind: 'regular' })}>
            Keep training
          </button>
        </div>
      </div>
    </div>
  );
}
