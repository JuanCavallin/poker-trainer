import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  defaultActionIndex,
  gradeHand,
  newStrategy,
  resolveStrategy,
  scoreRange,
  scoreSketch,
  type HandResult,
  type RangeScore,
  type SketchScore,
} from '../../engine/analysis';
import { NUM_CLASSES, classCombos, classLabel, comboC1, comboC2, comboClass } from '../../engine/combos';
import type { Position } from '../../engine/seats';
import { PROFILES, PROFILE_IDS, type ProfileId } from '../../engine/profiles';
import { randomSeed } from '../../engine/rng';
import { classifyTexture } from '../../engine/texture';
import { NODE_TYPE_INFO, STREETS, STREET_LABEL, type SpotPackage, type SpotRequest, type Street } from '../../engine/types';
import { familyLabel } from '../../learning/families';
import { nextDrill, type DrillFilters } from '../../learning/selector';
import { useStore, type Outcome } from '../../state/store';
import type { AttemptRecord } from '../../state/types';
import { engine } from '../../worker/client';
import { CardBack, PlayingCard } from '../components/Cards';
import { Ring, scoreColor } from '../components/Charts';
import { ClassGrid } from '../components/ClassGrid';
import { Feedback } from '../components/Feedback';
import { celebrate } from '../components/Overlays';
import { SeatPicker, seatOrUndefined, type Seat } from '../components/SeatPicker';
import { useFelt } from '../components/TablePanels';
import { useNav } from '../nav';
import { sfx } from '../sound';
import { ACTION_COLOR, NONE_COLOR, actionColors, bb, formatMs, mixGradient, pct } from '../util';

type Phase = 'setup' | 'loading' | 'draw' | 'reveal' | 'error';

interface Config {
  street: Street;
  profile: ProfileId;
  pot: 'any' | 'SRP' | '3BP';
  hero: Seat;
  villain: Seat;
}

interface Result {
  steps: SketchScore[];
  overlap: number;
  resolved: Float32Array;
  score: RangeScore;
  hand: HandResult;
  outcome: Outcome;
  ms: number;
}

const FREQS = [1, 0.75, 0.5, 0.25];
const ACTOR_COLOR = { villain: 'var(--berry)', hero: 'var(--sage)' } as const;

/** Classes with no combos left once the board's cards are out. */
function blockedClasses(board: readonly number[]): boolean[] {
  const dead = new Set(board);
  return Array.from({ length: NUM_CLASSES }, (_, c) => classCombos[c].every((id) => dead.has(comboC1[id]) || dead.has(comboC2[id])));
}

function liveCount(cls: number, board: readonly number[]): number {
  const dead = new Set(board);
  return classCombos[cls].filter((id) => !dead.has(comboC1[id]) && !dead.has(comboC2[id])).length;
}

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

/** Classes ordered from strongest to weakest preflop, for the "top x%" painter (the equity table loads on first use). */
let preflopOrder: number[] | null = null;
async function strengthOrder(): Promise<number[]> {
  if (!preflopOrder) {
    const { vsRandom } = await import('../../engine/preflop');
    const vr = vsRandom();
    preflopOrder = Array.from({ length: NUM_CLASSES }, (_, c) => c).sort((a, b) => vr[b] - vr[a]);
  }
  return preflopOrder;
}

export function Sketch({ session }: { session: { kind: 'sketch'; filters?: DrillFilters; title?: string } }) {
  const go = useNav((s) => s.go);
  const settings = useStore((s) => s.settings);
  const [phase, setPhase] = useState<Phase>(session.filters ? 'loading' : 'setup');
  const [cfg, setCfg] = useState<Config>({ street: 'flop', profile: 'gto', pot: 'any', hero: settings.heroSeat, villain: settings.villainSeat });
  const [spot, setSpot] = useState<SpotPackage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [drawn, setDrawn] = useState<Float32Array[]>([]);
  const [respond, setRespond] = useState<Float32Array>(new Float32Array(0));
  const [freq, setFreq] = useState(1);
  const [action, setAction] = useState(0);
  const [erase, setErase] = useState(false);
  const [topPct, setTopPct] = useState(20);
  const [hover, setHover] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [startTs, setStartTs] = useState(Date.now());
  const undo = useRef<{ step: number; data: Float32Array }[]>([]);
  const strokeBase = useRef<Float32Array | null>(null);
  const count = useRef(0);
  const prefetched = useRef<{ req: SpotRequest; promise: Promise<SpotPackage> } | null>(null);
  const lastReq = useRef<SpotRequest | undefined>(undefined);

  const makeRequest = useCallback((): SpotRequest => {
    if (session.filters) return nextDrill(session.filters, count.current, lastReq.current);
    return {
      seed: randomSeed(),
      street: cfg.street,
      profile: cfg.profile,
      potType: cfg.pot === 'any' || cfg.street === 'preflop' ? undefined : cfg.pot,
      heroPos: seatOrUndefined(cfg.hero) as Position | undefined,
      villainPos: seatOrUndefined(cfg.villain) as Position | undefined,
    };
  }, [session.filters, cfg]);

  const begin = useCallback((s: SpotPackage) => {
    setSpot(s);
    lastReq.current = s.request;
    setDrawn(s.line.map(() => new Float32Array(NUM_CLASSES)));
    setRespond(new Float32Array(NUM_CLASSES * s.actions.length));
    setStep(0);
    setResult(null);
    setErase(false);
    setAction(Math.max(0, s.actions.findIndex((a) => a.key === 'call' || a.aggressive)));
    undo.current = [];
    setStartTs(Date.now());
    setPhase('draw');
  }, []);

  const load = useCallback(async () => {
    setPhase('loading');
    let item = prefetched.current;
    prefetched.current = null;
    if (!item) {
      const req = makeRequest();
      item = { req, promise: engine.generate(req) };
    }
    try {
      begin(await item.promise);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [makeRequest, begin]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current || !session.filters) return;
    started.current = true;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const N = spot?.line.length ?? 0;
  const responding = !!spot && step >= N;
  const cur = spot && !responding ? spot.line[step] : null;
  const board = cur ? cur.board : (spot?.board ?? []);
  const blocked = useMemo(() => blockedClasses(board), [board]);
  const nA = spot?.actions.length ?? 0;

  /** The same player's previous drawing, shown as an outline. */
  const ghost = useMemo(() => {
    if (!spot) return undefined;
    const actor = responding ? 'hero' : spot.line[step]?.actor;
    for (let j = Math.min(step, N) - 1; j >= 0; j--) if (spot.line[j].actor === actor) return drawn[j];
    return undefined;
  }, [spot, step, N, responding, drawn]);

  // ------------------------------------------------------------------ painting
  const paint = useCallback(
    (cls: number, rightErase: boolean) => {
      const del = rightErase || erase;
      if (responding) {
        setRespond((prev) => {
          if (!strokeBase.current) strokeBase.current = prev;
          const next = Float32Array.from(prev);
          for (let a = 0; a < nA; a++) next[cls * nA + a] = !del && a === action ? 1 : 0;
          return next;
        });
      } else {
        setDrawn((prev) => {
          if (!strokeBase.current) strokeBase.current = prev[step];
          const next = prev.slice();
          next[step] = Float32Array.from(prev[step]);
          next[step][cls] = del ? 0 : freq;
          return next;
        });
      }
    },
    [erase, responding, nA, action, step, freq],
  );

  const endStroke = useCallback(() => {
    if (strokeBase.current) {
      undo.current.push({ step, data: strokeBase.current });
      if (undo.current.length > 80) undo.current.shift();
      strokeBase.current = null;
    }
  }, [step]);

  const setWhole = (data: Float32Array) => {
    if (responding) {
      undo.current.push({ step, data: respond });
      setRespond(data);
    } else {
      undo.current.push({ step, data: drawn[step] });
      setDrawn((prev) => prev.map((d, i) => (i === step ? data : d)));
    }
  };

  const undoLast = () => {
    const u = undo.current.pop();
    if (!u) return;
    if (u.step >= N) setRespond(u.data);
    else setDrawn((prev) => prev.map((d, i) => (i === u.step ? u.data : d)));
    setStep(u.step);
  };

  const paintTop = async (p: number) => {
    const order = await strengthOrder();
    const out = new Float32Array(NUM_CLASSES);
    const target = (1326 * p) / 100;
    let sum = 0;
    for (const c of order) {
      if (sum >= target) break;
      out[c] = 1;
      sum += classCombos[c].length;
    }
    setWhole(out);
  };

  const fillRest = () => {
    const next = Float32Array.from(respond);
    for (let c = 0; c < NUM_CLASSES; c++) {
      let sum = 0;
      for (let a = 0; a < nA; a++) sum += next[c * nA + a];
      if (sum <= 0 && !blocked[c]) next[c * nA + action] = 1;
    }
    setWhole(next);
  };

  // ------------------------------------------------------------------ finishing
  const finish = useCallback(async () => {
    if (!spot) return;
    const steps = spot.line.map((s, i) => scoreSketch(drawn[i], s.range, s.board));
    const overlap = steps.length ? steps.reduce((a, s) => a + s.overlap, 0) / steps.length : 1;
    const strat = newStrategy(spot);
    for (let k = 0; k < spot.hero.n; k++) {
      const cls = comboClass[spot.hero.combos[k]];
      for (let a = 0; a < nA; a++) strat[k * nA + a] = respond[cls * nA + a];
    }
    const resolved = resolveStrategy(spot, strat);
    const expl = spot.solution.balance ? await engine.exploitability(spot, resolved).catch(() => null) : null;
    const score = scoreRange(spot, resolved, expl);
    const dealt = sampleWeighted(spot.hero.weights);
    let act = 0;
    for (let a = 1; a < nA; a++) if (resolved[dealt * nA + a] > resolved[dealt * nA + act]) act = a;
    const hand = gradeHand(spot, dealt, act);
    const ms = Date.now() - startTs;
    const rec: AttemptRecord = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      ts: Date.now(),
      kind: 'sketch',
      family: spot.family,
      nodeType: spot.nodeType,
      texture: classifyTexture(spot.board).id,
      profile: spot.profile,
      scenarioId: spot.scenario.id,
      potType: spot.scenario.potType,
      street: spot.street,
      heroPos: spot.heroPos,
      villainPos: spot.villainPos,
      request: spot.request,
      score: score.score,
      accuracy: score.accuracy,
      balance: score.balance,
      evLossPct: score.evLossPct,
      exploitPct: score.exploitPct,
      matchPct: score.matchPct,
      hand: { combo: spot.hero.combos[dealt], action: spot.actions[act].short, grade: hand.grade, lossPct: hand.lossPct },
      ms,
      tendencies: score.tendencies,
      capture: score.capture,
      finds: [],
      difficulty: Math.min(1, spot.difficulty + 0.15),
      sketch: { steps: steps.length, overlap },
    };
    const outcome = useStore.getState().recordAttempt(rec, { balanceHit: false, mdfHit: false, board: spot.board });
    count.current += 1;
    setResult({ steps, overlap, resolved, score, hand, outcome, ms });
    setPhase('reveal');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (overlap >= 0.75 || score.score >= 90) {
      sfx.great();
      celebrate(0.9);
    } else sfx.good();
    // Keep the next sketch solving while the results are read.
    const req = makeRequest();
    const promise = engine.generate(req, true);
    promise.catch(() => undefined);
    prefetched.current = { req, promise };
  }, [spot, drawn, respond, nA, startTs, makeRequest]);

  const next = useCallback(() => {
    if (!spot) return;
    if (step < N) setStep(step + 1);
    else void finish();
  }, [spot, step, N, finish]);

  useEffect(() => {
    if (phase !== 'draw') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        next();
      } else if (e.key === 'e' || e.key === 'E') setErase((v) => !v);
      else if (e.key === 'z' || e.key === 'Z') undoLast();
      else {
        const n = Number(e.key);
        if (n >= 1 && n <= 9) {
          setErase(false);
          if (responding && n <= nA) setAction(n - 1);
          else if (!responding && n <= FREQS.length) setFreq(FREQS[n - 1]);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, next, responding, nA]);

  // ------------------------------------------------------------------ render
  if (phase === 'setup') return <Setup cfg={cfg} setCfg={setCfg} onStart={() => void load()} />;

  if (phase === 'error')
    return (
      <div className="loading-den">
        <div className="panel" style={{ maxWidth: 480 }}>
          <h2>🙈 Couldn't deal that spot</h2>
          <p className="muted">{error}</p>
          <div className="row">
            <button className="btn" onClick={() => void load()}>
              Try another
            </button>
            <button className="btn secondary" onClick={() => setPhase('setup')}>
              Change settings
            </button>
          </div>
        </div>
      </div>
    );

  if (phase === 'loading' || !spot)
    return (
      <div className="loading-den">
        <div>
          <div className="shuffle">
            <CardBack size={52} />
            <CardBack size={52} />
            <CardBack size={52} />
          </div>
          <h3>Solving every street of a fresh hand…</h3>
          <p className="muted small">The real ranges stay hidden until you've drawn yours.</p>
        </div>
      </div>
    );

  const header = (
    <div className="spot-header">
      <h2>✏️ {session.title ?? 'Range Sketch'}</h2>
      <span className="tag honey">{familyLabel(spot.family).full}</span>
      <span className="tag">
        You {spot.heroPos} vs {spot.villainPos} {PROFILES[spot.profile].emoji}
      </span>
      <div className="spacer" />
      {phase === 'draw' && (
        <span className="muted small">
          Step {Math.min(step + 1, N + 1)} of {N + 1}
        </span>
      )}
      <button className="btn ghost small" onClick={() => (session.filters ? go('drills') : setPhase('setup'))}>
        ⚙︎ Settings
      </button>
      <button className="btn ghost small" onClick={() => go('home')}>
        ✕ Leave
      </button>
    </div>
  );

  if (phase === 'reveal' && result)
    return (
      <div>
        {header}
        <Reveal spot={spot} drawn={drawn} result={result} onNext={() => void load()} />
      </div>
    );

  const visible = spot.line.slice(0, Math.min(step + 1, N));
  const values = responding
    ? Float32Array.from({ length: NUM_CLASSES }, (_, c) => {
        let s = 0;
        for (let a = 0; a < nA; a++) s += respond[c * nA + a];
        return s > 0 ? 1 : 0;
      })
    : drawn[step];
  const colors = responding
    ? Array.from({ length: NUM_CLASSES }, (_, c) => mixGradient(actionColors(spot), Array.from({ length: nA }, (_, a) => respond[c * nA + a])))
    : ACTOR_COLOR[cur!.actor];
  let combos = 0;
  if (!responding) for (let c = 0; c < NUM_CLASSES; c++) combos += drawn[step][c] * liveCount(c, board);
  const def = spot.actions[defaultActionIndex(spot)];
  const hoverInfo = hover != null ? `${classLabel(hover)}${ghost && ghost[hover] > 0 ? ` · your previous range: ${pct(ghost[hover])}` : ''}` : '';

  return (
    <div>
      {header}
      <div className="sketch">
        <div className="col" style={{ gap: 14 }}>
          <SketchTable spot={spot} board={board} />
          <div className="panel">
            <div className="panel-title">
              <h3>📜 The hand so far</h3>
            </div>
            <div className="sketch-steps">
              {visible.map((s, i) => (
                <button key={i} className={`sketch-step${i === step ? ' on' : ''}`} onClick={() => setStep(i)} title="Go back to this step">
                  <span className="dot" style={{ background: ACTOR_COLOR[s.actor] }} />
                  <span className="tiny muted">{STREET_LABEL[s.street]}</span>
                  <span>{s.text}</span>
                  {i < step && <span className="tiny muted">✓ drawn</span>}
                </button>
              ))}
              {responding && (
                <div className="sketch-step on">
                  <span className="dot" style={{ background: 'var(--honey)' }} />
                  <span className="tiny muted">{STREET_LABEL[spot.street]}</span>
                  <span>Your decision</span>
                </div>
              )}
            </div>
            <p className="tiny muted" style={{ marginBottom: 0 }}>
              Later actions stay hidden until you reach them. You can step back and redraw; accuracy appears at the end.
            </p>
          </div>
        </div>

        <div className="panel">
          {responding ? (
            <>
              <h3 style={{ marginTop: 0 }}>Your move: {NODE_TYPE_INFO[spot.nodeType].label}</h3>
              <p className="small" style={{ marginTop: 0 }}>
                {spot.heroPrior && <span className="muted">{spot.heroPrior}. </span>}
                {spot.villainAction.label}. Pot {bb(spot.pot)}
                {spot.toCall > 0 && ` · ${bb(spot.toCall)} to call`}. Paint what you do with each hand; outlined hands are the range you drew for yourself. Unpainted hands{' '}
                {def.short.toLowerCase()}.
              </p>
              <div className="brushbar">
                {spot.actions.map((a, i) => (
                  <button key={i} className={`brush${!erase && action === i ? ' on' : ''}`} style={{ ['--c' as string]: ACTION_COLOR[a.key] }} onClick={() => (setErase(false), setAction(i))} title={a.label}>
                    <span className="sw" />
                    {a.short}
                    <span className="kbd">{i + 1}</span>
                  </button>
                ))}
                <button className={`brush${erase ? ' on' : ''}`} style={{ ['--c' as string]: NONE_COLOR }} onClick={() => setErase(true)}>
                  Erase <span className="kbd">E</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="small muted" style={{ fontWeight: 800, letterSpacing: 0.3 }}>
                {STREET_LABEL[cur!.street].toUpperCase()} · {cur!.actor === 'villain' ? `VILLAIN (${PROFILES[spot.profile].name})` : 'YOU'}
              </div>
              <h3 style={{ margin: '2px 0 4px' }}>{cur!.text}</h3>
              <p className="small" style={{ marginTop: 0 }}>
                {cur!.actor === 'villain'
                  ? `Paint every hand ${cur!.pos} gets here and plays this way: their ${cur!.verb} range.`
                  : `Paint every hand you get here and play this way: your ${cur!.verb} range.`}{' '}
                Paint lighter for hands that only sometimes take this line.
              </p>
              <div className="brushbar">
                {FREQS.map((f, i) => (
                  <button key={f} className={`brush${!erase && freq === f ? ' on' : ''}`} style={{ ['--c' as string]: ACTOR_COLOR[cur!.actor] }} onClick={() => (setErase(false), setFreq(f))}>
                    <span className="sw" style={{ opacity: 0.25 + 0.75 * f }} />
                    {Math.round(f * 100)}%<span className="kbd">{i + 1}</span>
                  </button>
                ))}
                <button className={`brush${erase ? ' on' : ''}`} style={{ ['--c' as string]: NONE_COLOR }} onClick={() => setErase(true)}>
                  Erase <span className="kbd">E</span>
                </button>
              </div>
            </>
          )}
          <div style={{ marginTop: 10, maxWidth: 640, marginInline: 'auto' }}>
            <ClassGrid values={values} color={colors} ghost={ghost} blocked={blocked} onPaint={paint} onStrokeEnd={endStroke} onHover={setHover} />
          </div>
          <div className="row wrap small" style={{ marginTop: 8, gap: 8 }}>
            {!responding && (
              <span className="num">
                <b>{combos.toFixed(0)}</b> combos · {pct(combos / liveTotal(board))} of hands
              </span>
            )}
            <span className="muted">{hoverInfo || 'Drag to paint · right-click or E erases · Z undoes'}</span>
            <span className="spacer" />
            <button className="btn secondary small" onClick={undoLast} disabled={!undo.current.length}>
              ↶
            </button>
            {ghost && !responding && (
              <button className="btn secondary small" onClick={() => setWhole(Float32Array.from(ghost))} title="Copy your previous range for this player, then trim it">
                Start from my last {cur!.actor === 'hero' ? 'range' : 'drawing of them'}
              </button>
            )}
            {responding && (
              <button className="btn secondary small" onClick={fillRest}>
                Fill rest with {spot.actions[action].short}
              </button>
            )}
            <button className="btn secondary small" onClick={() => setWhole(new Float32Array(responding ? NUM_CLASSES * nA : NUM_CLASSES))}>
              Clear
            </button>
          </div>
          {!responding && cur!.street === 'preflop' && (
            <div className="mixbox" style={{ marginTop: 10 }}>
              <span style={{ fontWeight: 800 }}>Top</span>
              <input type="range" min={2} max={100} step={1} value={topPct} onChange={(e) => setTopPct(Number(e.target.value))} />
              <span className="num">{topPct}%</span>
              <button className="btn secondary small" onClick={() => void paintTop(topPct)} title="Paint the strongest starting hands as a starting point">
                Paint the top {topPct}% of hands
              </button>
            </div>
          )}
          <div className="row" style={{ marginTop: 12, gap: 10 }}>
            {step > 0 && (
              <button className="btn secondary" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
            <span className="spacer" />
            <span className="muted small">⏱ {formatMs(Date.now() - startTs)}</span>
            <button className="btn big" onClick={next}>
              {responding ? 'Finish and reveal' : step === N - 1 ? 'Next: your decision' : 'Next action'} <span className="kbd">Enter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function liveTotal(board: readonly number[]): number {
  let n = 0;
  for (let c = 0; c < NUM_CLASSES; c++) n += liveCount(c, board);
  return n;
}

function SketchTable({ spot, board }: { spot: SpotPackage; board: number[] }) {
  const [fa, fb] = useFelt();
  return (
    <div className="felt" style={{ ['--felt-a' as string]: fa, ['--felt-b' as string]: fb }}>
      <div className="row tiny" style={{ opacity: 0.85, fontWeight: 800 }}>
        <span>
          {spot.scenario.name} · {spot.scenario.potType}
        </span>
        <span className="spacer" />
        <span>
          {PROFILES[spot.profile].emoji} {PROFILES[spot.profile].name}
        </span>
      </div>
      <div className="board">
        {board.map((c, i) => (
          <PlayingCard key={i} card={c} size={40} />
        ))}
        {Array.from({ length: 5 - board.length }, (_, i) => (
          <div key={`e${i}`} className="pcard empty-slot" style={{ ['--w' as string]: '40px' }} />
        ))}
      </div>
      <div className="seats">
        <div className="seat">
          <span>{PROFILES[spot.profile].emoji}</span>
          <b>{spot.villainPos}</b>
        </div>
        <div className="seat">
          <span>🫵</span>
          <b>You ({spot.heroPos})</b>
        </div>
      </div>
    </div>
  );
}

function Setup({ cfg, setCfg, onStart }: { cfg: Config; setCfg: (c: Config) => void; onStart: () => void }) {
  return (
    <div className="col" style={{ gap: 18, maxWidth: 900, margin: '0 auto' }}>
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #b0846a, #8a5a7a 55%, #5a5f8a)' }}>
        <span className="deco">✏️</span>
        <h1>Range Sketch</h1>
        <p>
          No ranges are shown. Follow the hand action by action and, in order, draw the villain's range after each thing they do and your own range in reply. You see your earlier
          drawings as you go, but not how accurate they were: that waits for the end, when every drawing is laid next to the real range from the solver.
        </p>
      </div>
      <div className="panel">
        <div className="field">
          <label>Decision street</label>
          <div className="seg">
            {STREETS.map((s) => (
              <button key={s} className={cfg.street === s ? 'on' : ''} onClick={() => setCfg({ ...cfg, street: s })}>
                {STREET_LABEL[s]}
              </button>
            ))}
          </div>
          <span className="small muted">
            {cfg.street === 'preflop'
              ? 'One or two ranges to draw, then your preflop decision. A great way to learn the charts.'
              : cfg.street === 'flop'
                ? 'Preflop ranges plus the start of the flop: about 3–5 drawings.'
                : cfg.street === 'turn'
                  ? 'Preflop, the whole flop, then the turn: about 5–7 drawings.'
                  : 'The full hand to the river: about 6–9 drawings. The deepest test of range reading.'}
          </span>
        </div>
        {cfg.street !== 'preflop' && (
          <div className="field">
            <label>Pot</label>
            <div className="seg">
              {(['any', 'SRP', '3BP'] as const).map((p) => (
                <button key={p} className={cfg.pot === p ? 'on' : ''} onClick={() => setCfg({ ...cfg, pot: p })}>
                  {p === 'any' ? 'Any' : p === 'SRP' ? 'Single-raised' : '3-bet pot'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Villain</label>
          <div className="chipsel">
            {PROFILE_IDS.map((p) => (
              <button key={p} className={cfg.profile === p ? 'on' : ''} onClick={() => setCfg({ ...cfg, profile: p })} title={PROFILES[p].blurb}>
                {PROFILES[p].emoji} {PROFILES[p].name}
              </button>
            ))}
          </div>
          <span className="small muted">{PROFILES[cfg.profile].blurb} Their style shapes their preflop ranges too.</span>
        </div>
        <SeatPicker hero={cfg.hero} villain={cfg.villain} onChange={(hero, villain) => setCfg({ ...cfg, hero, villain })} />
        <button className="btn big" style={{ marginTop: 12 }} onClick={onStart}>
          ▶ Deal a hand
        </button>
      </div>
    </div>
  );
}

function topClasses(diff: Float32Array, sign: 1 | -1, n = 5): string[] {
  return Array.from({ length: NUM_CLASSES }, (_, c) => c)
    .filter((c) => sign * diff[c] > 0.5)
    .sort((a, b) => sign * diff[b] - sign * diff[a])
    .slice(0, n)
    .map(classLabel);
}

function Reveal({ spot, drawn, result, onNext }: { spot: SpotPackage; drawn: Float32Array[]; result: Result; onNext: () => void }) {
  const [open, setOpen] = useState(0);
  const o = Math.round(result.overlap * 100);
  const headline = o >= 75 ? 'You can read minds' : o >= 60 ? 'Sharp range reading' : o >= 45 ? 'Good outline, details to tidy' : 'Ranges are tricky. Look at what was missing';
  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel">
        <div className="row wrap" style={{ gap: 18 }}>
          <Ring value={result.overlap} color={scoreColor(o)}>
            <div>
              <b>{o}%</b>
              <div className="tiny muted">range overlap</div>
            </div>
          </Ring>
          <Ring value={result.score.score / 100} color={scoreColor(result.score.score)}>
            <div>
              <b>{result.score.score}</b>
              <div className="tiny muted">decision</div>
            </div>
          </Ring>
          <div className="col" style={{ flex: 1, minWidth: 220, gap: 4 }}>
            <h2 style={{ margin: 0 }}>{headline}</h2>
            <p className="small muted" style={{ margin: 0 }}>
              Overlap is the share of combos your drawing and the real range have in common, out of all combos in either. Matching the shape matters more than the exact edge: 60%+ is
              strong reading.
            </p>
            <div className="reward-row">
              <span className="reward">✨ +{result.outcome.xp} XP</span>
              <span className="reward">🪙 +{result.outcome.chips}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Your drawings vs the real ranges</h3>
        <div className="tabs">
          {spot.line.map((s, i) => (
            <button key={i} className={open === i ? 'on' : ''} onClick={() => setOpen(i)}>
              {s.pos} {s.verb.split(' ')[0]} · {Math.round(result.steps[i].overlap * 100)}%
            </button>
          ))}
        </div>
        {spot.line[open] && (
          <SketchCompare step={spot.line[open]} drawn={drawn[open]} score={result.steps[open]} profile={spot.profile} />
        )}
      </div>

      <Feedback
        spot={spot}
        user={result.resolved}
        score={result.score}
        exploitPending={false}
        hand={result.hand}
        finds={[]}
        outcome={null}
        ms={result.ms}
        onNext={onNext}
        nextLabel="Next sketch"
      />
    </div>
  );
}

function SketchCompare({ step, drawn, score, profile }: { step: SpotPackage['line'][number]; drawn: Float32Array; score: SketchScore; profile: ProfileId }) {
  const blocked = blockedClasses(step.board);
  const color = ACTOR_COLOR[step.actor];
  const over = topClasses(score.classDiff, 1);
  const under = topClasses(score.classDiff, -1);
  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="small">
        <b>{step.text}</b> <span className="muted">· {STREET_LABEL[step.street]} · {step.actor === 'villain' ? `${PROFILES[profile].name}'s ${step.verb} range` : `your ${step.verb} range`}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div>
          <div className="small" style={{ fontWeight: 800, marginBottom: 4 }}>
            You drew · {score.drawnCombos.toFixed(0)} combos
          </div>
          <ClassGrid values={drawn} color={color} blocked={blocked} />
        </div>
        <div>
          <div className="small" style={{ fontWeight: 800, marginBottom: 4 }}>
            Real range · {score.actualCombos.toFixed(0)} combos
          </div>
          <ClassGrid values={score.actualClass} color={color} blocked={blocked} ghost={drawn} />
        </div>
      </div>
      <div className="insights">
        <div className="insight">
          <span className="ic">{score.overlap >= 0.6 ? '🎯' : '🧭'}</span>
          <span>
            {Math.round(score.overlap * 100)}% overlap.{' '}
            {score.drawnCombos > score.actualCombos * 1.25
              ? 'Your range was too wide: this action filters out more hands than you allowed for.'
              : score.drawnCombos < score.actualCombos * 0.8
                ? 'Your range was too narrow: more hands take this line than you expected.'
                : 'About the right size; the differences are in which hands.'}
          </span>
        </div>
        {under.length > 0 && (
          <div className="insight">
            <span className="ic">➕</span>
            <span>Missing (in the real range, not in yours): {under.join(', ')}</span>
          </div>
        )}
        {over.length > 0 && (
          <div className="insight">
            <span className="ic">➖</span>
            <span>Extra (in yours, not the real one): {over.join(', ')}</span>
          </div>
        )}
      </div>
      <div className="tiny muted">On the real range, the outline shows your drawing. Shorter bars mean the hand takes this line only part of the time.</div>
    </div>
  );
}
