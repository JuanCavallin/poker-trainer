import { useEffect, useState } from 'react';
import { FINDS, GRADE_INFO, spotStats, type FindId, type HandResult, type RangeScore, type Strategy } from '../../engine/analysis';
import { cardPretty } from '../../engine/cards';
import { PROFILES } from '../../engine/profiles';
import { STREET_LABEL, type SpotPackage } from '../../engine/types';
import { achievementById } from '../../learning/achievements';
import type { Outcome } from '../../state/store';
import type { Confidence } from '../../state/types';
import { buildInsights, explainHand } from '../insights';
import { ACTION_COLOR, actionColors, bb, formatMs, pct } from '../util';
import { ComboText } from './Cards';
import { Ring, Stars, scoreColor } from './Charts';
import { RangeGrid } from './RangeGrid';

export interface TwinContext {
  spot: SpotPackage;
  label: string;
}

const HEADLINES: [number, string][] = [
  [90, 'Beautiful range!'],
  [75, 'Solid range'],
  [55, 'Decent, with a few leaks'],
  [0, "Let's tidy this one up"],
];

function freqSummary(spot: SpotPackage, strat: Float32Array): { label: string; freq: number; color: string }[] {
  const nA = spot.actions.length;
  const st = spotStats(spot);
  const out = spot.actions.map((a) => ({ label: a.short, freq: 0, color: ACTION_COLOR[a.key] }));
  for (let k = 0; k < spot.hero.n; k++) for (let a = 0; a < nA; a++) out[a].freq += (spot.hero.weights[k] * strat[k * nA + a]) / st.totalWeight;
  return out;
}

function FreqLine({ items }: { items: { label: string; freq: number; color: string }[] }) {
  return (
    <div className="freqbar" style={{ height: 18 }}>
      {items.map((x) =>
        x.freq > 0.005 ? (
          <div key={x.label} style={{ width: `${x.freq * 100}%`, background: x.color }} title={`${x.label} ${pct(x.freq)}`}>
            {x.freq > 0.14 ? `${x.label} ${pct(x.freq)}` : ''}
          </div>
        ) : null,
      )}
    </div>
  );
}

export function Feedback({
  spot,
  user,
  score,
  exploitPending,
  hand,
  finds,
  outcome,
  ms,
  confidence,
  twin,
  onNext,
  nextLabel,
  onTwin,
  onResolveNext,
}: {
  spot: SpotPackage;
  user: Strategy;
  score: RangeScore;
  exploitPending: boolean;
  hand: HandResult;
  finds: FindId[];
  outcome: Outcome | null;
  ms: number;
  confidence?: Confidence;
  twin?: TwinContext | null;
  onNext: () => void;
  nextLabel: string;
  onTwin?: (kind: 'card' | 'villain') => void;
  /** Flop and turn spots: re-solve for a different next card. */
  onResolveNext?: () => void;
}) {
  const [tab, setTab] = useState<'hand' | 'range' | 'insights'>('hand');
  const [gridView, setGridView] = useState<'side' | 'diff'>('side');
  const nA = spot.actions.length;
  const grade = GRADE_INFO[hand.grade];
  const id = spot.hero.combos[hand.k];
  const headline = HEADLINES.find(([min]) => score.score >= min)![1];
  const insights = buildInsights(spot, user, score);
  const refLabel = spot.solution.mode === 'gto' ? 'Solver' : `Best vs ${PROFILES[spot.profile].name}`;
  const evMax = Math.max(...hand.evs.map((v) => Math.abs(v)), 0.01);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNext]);

  if (confidence === 'sure' && score.score < 60)
    insights.unshift({ icon: '💡', text: 'You felt sure but missed: confident errors are the ones you learn fastest from. This family will come back soon.', tone: 'warn' });
  if (confidence === 'unsure' && score.score >= 85) insights.unshift({ icon: '🌱', text: 'You were unsure, yet this was excellent. Trust your reads a little more!', tone: 'good' });

  return (
    <div className="col" style={{ gap: 14 }}>
      <div className="panel">
        <div className="row" style={{ gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
          <Ring value={score.score / 100} color={scoreColor(score.score)}>
            <div>
              <b>{score.score}</b>
              <div className="tiny muted">range score</div>
            </div>
          </Ring>
          <div className="col" style={{ flex: 1, minWidth: 240, gap: 6 }}>
            <div className="row">
              <Stars n={score.stars} />
              <div className="spacer" />
              <span className="tag">{spot.solution.mode === 'gto' ? '🦉 vs equilibrium' : `${PROFILES[spot.profile].emoji} exploit spot`}</span>
            </div>
            <h2 style={{ margin: 0 }}>{headline}</h2>
            <div className="subscores">
              <div className="subscore" title="Average EV lost per hand compared with the reference strategy">
                <div className="k">Hand-by-hand</div>
                <div className="v">{score.accuracy}</div>
                <div className="tiny muted">−{bb(score.evLossBb, 2)} / hand ({score.evLossPct.toFixed(1)}% pot)</div>
              </div>
              {spot.solution.mode === 'gto' ? (
                <div className="subscore" title="How much a perfectly adapting opponent could win from your frequencies">
                  <div className="k">Balance</div>
                  <div className="v">{exploitPending ? '…' : score.balance}</div>
                  <div className="tiny muted">{exploitPending ? 'asking the solver…' : `exploitable for ${score.exploitPct?.toFixed(1)}% pot`}</div>
                </div>
              ) : (
                <div className="subscore" title="Share of the extra EV available against this villain that you captured">
                  <div className="k">Exploit captured</div>
                  <div className="v">{score.capture == null ? '–' : pct(Math.max(0, score.capture))}</div>
                  <div className="tiny muted">0% = played GTO · 100% = max exploit</div>
                </div>
              )}
              <div className="subscore" title="How closely your action frequencies per hand match the reference">
                <div className="k">Strategy match</div>
                <div className="v">{Math.round(score.matchPct)}%</div>
                <div className="tiny muted">per-hand frequency overlap</div>
              </div>
              <div className="subscore">
                <div className="k">Time</div>
                <div className="v">{formatMs(ms)}</div>
                <div className="tiny muted">{confidence ? `felt ${confidence === 'sure' ? 'certain' : confidence === 'fair' ? 'fairly sure' : 'unsure'}` : 'range build'}</div>
              </div>
            </div>
          </div>
        </div>

        <div className={`grade-banner ${grade.tone}`} style={{ marginTop: 14 }}>
          <span className="big-emoji">{grade.emoji}</span>
          <div style={{ flex: 1 }}>
            <div className="small muted" style={{ fontWeight: 800 }}>
              YOUR HAND · <ComboText combo={id} />
            </div>
            <h3 style={{ margin: 0 }}>
              {hand.grade}: {spot.actions[hand.action].short}
              {hand.action !== hand.best && hand.lossPct > 0.6 && <span className="muted"> (best: {spot.actions[hand.best].short})</span>}
            </h3>
            <div className="small">
              {hand.lossBb < 0.005 ? 'No EV lost on this hand.' : `Cost ${bb(hand.lossBb, 2)} (${hand.lossPct.toFixed(1)}% of the pot) vs the best action.`}
            </div>
          </div>
        </div>

        {finds.length > 0 && (
          <div className="col" style={{ marginTop: 12, gap: 8 }}>
            {finds.map((f) => (
              <div key={f} className="find-badge">
                <span className="e">{FINDS[f].emoji}</span>
                <div>
                  <b>Highlight: {FINDS[f].title}!</b>
                  <div className="small">{FINDS[f].desc} Saved to your scrapbook.</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {outcome && (
          <div className="reward-row" style={{ marginTop: 12 }}>
            <span className="reward">✨ +{outcome.xp} XP</span>
            <span className="reward" style={{ animationDelay: '0.1s' }}>
              🪙 +{outcome.chips}
            </span>
            {outcome.streakUp && (
              <span className="reward" style={{ animationDelay: '0.2s' }}>
                🔥 streak kept warm
              </span>
            )}
            {outcome.levelUp && (
              <span className="reward" style={{ animationDelay: '0.3s', background: 'var(--honey-l)' }}>
                🎉 Level {outcome.levelUp}!
              </span>
            )}
            {outcome.achievements.map((a) => (
              <span key={a} className="reward" style={{ animationDelay: '0.4s', background: 'var(--honey-l)' }}>
                {achievementById(a)?.emoji} {achievementById(a)?.name}
              </span>
            ))}
            {outcome.quests.length > 0 && (
              <span className="reward" style={{ animationDelay: '0.5s' }}>
                📜 quest complete
              </span>
            )}
          </div>
        )}
      </div>

      {twin && <TwinCompare spot={spot} twin={twin} />}

      <div className="panel">
        <div className="tabs">
          <button className={tab === 'hand' ? 'on' : ''} onClick={() => setTab('hand')}>
            🃏 Your hand
          </button>
          <button className={tab === 'range' ? 'on' : ''} onClick={() => setTab('range')}>
            🧩 Range vs {spot.solution.mode === 'gto' ? 'solver' : 'best exploit'}
          </button>
          <button className={tab === 'insights' ? 'on' : ''} onClick={() => setTab('insights')}>
            💡 Insights ({insights.length})
          </button>
        </div>

        {tab === 'hand' && (
          <div className="col" style={{ gap: 12 }}>
            <div className="ev-bars">
              {spot.actions.map((a, i) => {
                const ev = hand.evs[i];
                const w = (Math.abs(ev) / evMax) * 50;
                return (
                  <div key={i} className={`ev-bar${i === hand.action ? ' chosen' : ''}`}>
                    <span>
                      {a.short}
                      {i === hand.best && ' 👑'}
                    </span>
                    <div className="track">
                      <div style={{ left: ev >= 0 ? '50%' : `${50 - w}%`, width: `${w}%`, background: ACTION_COLOR[a.key] }} />
                      <div style={{ left: '50%', width: 1, background: 'var(--line-2)' }} />
                    </div>
                    <span className="num" style={{ textAlign: 'right' }}>
                      {ev >= 0 ? '+' : ''}
                      {ev.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="tiny muted">EV in big blinds from this decision onward (folding = 0). {refLabel} frequencies for this exact hand:</div>
              <FreqLine
                items={spot.actions.map((a, i) => ({ label: a.short, freq: spot.solution.strategy[hand.k * nA + i], color: ACTION_COLOR[a.key] }))}
              />
            </div>
            <div className="insights">
              {explainHand(spot, hand).map((t, i) => (
                <div key={i} className="insight">
                  <span className="ic">{i === 0 ? '🔎' : '➡️'}</span>
                  <span>{t}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'range' && (
          <div className="col" style={{ gap: 12 }}>
            <div className="row">
              <div className="seg">
                <button className={gridView === 'side' ? 'on' : ''} onClick={() => setGridView('side')}>
                  Side by side
                </button>
                <button className={gridView === 'diff' ? 'on' : ''} onClick={() => setGridView('diff')}>
                  Where EV leaked
                </button>
              </div>
            </div>
            {gridView === 'side' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                <div>
                  <div className="small" style={{ fontWeight: 800, marginBottom: 4 }}>
                    You
                  </div>
                  <RangeGrid spot={spot} mode="user" strategy={user} dealtCombo={id} />
                </div>
                <div>
                  <div className="small" style={{ fontWeight: 800, marginBottom: 4 }}>
                    {refLabel}
                  </div>
                  <RangeGrid spot={spot} mode="ref" dealtCombo={id} />
                </div>
              </div>
            ) : (
              <div>
                <div className="small muted" style={{ marginBottom: 6 }}>
                  Darker = more EV lost in that hand class (weighted by how often you hold it).
                </div>
                <RangeGrid spot={spot} mode="diff" classLoss={score.classLoss} dealtCombo={id} />
              </div>
            )}
            <table className="compare-table">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>You</th>
                  <th>{refLabel}</th>
                  <th>{spot.street === 'river' ? 'Your bluffs' : 'Your weak bets'}</th>
                  <th>{spot.street === 'river' ? 'Ref bluffs' : 'Ref weak bets'}</th>
                  <th>{spot.street === 'river' ? 'Theory' : 'MDF'}</th>
                </tr>
              </thead>
              <tbody>
                {spot.actions.map((a, i) => (
                  <tr key={i}>
                    <td>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: actionColors(spot)[i], marginRight: 6 }} />
                      {a.short}
                    </td>
                    <td className="num">{pct(score.userFreq[i])}</td>
                    <td className="num">{pct(score.refFreq[i])}</td>
                    <td className="num">{a.aggressive ? pct(score.userBluff[i]) : ''}</td>
                    <td className="num">{a.aggressive ? pct(score.refBluff[i]) : ''}</td>
                    <td className="num">{a.aggressive && spot.street === 'river' ? pct(spot.theory.perAction[i]?.bluffShare ?? NaN) : a.key === 'call' ? `MDF ${pct(spot.theory.mdf)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'insights' && (
          <div className="insights">
            <div className="insight" style={{ background: 'var(--panel-2)' }}>
              <span className="ic">🤖</span>
              <span className="small">
                <b>How this spot was solved:</b> {spot.solution.model}
                {spot.street !== 'preflop' && spot.solution.solverExplPct > 0 && ` Solver precision: within ${spot.solution.solverExplPct.toFixed(2)}% of the pot of equilibrium.`}
              </span>
            </div>
            {insights.length === 0 && <div className="empty">Nothing to flag. Lovely.</div>}
            {insights.map((x, i) => (
              <div key={i} className="insight" style={x.tone === 'good' ? { background: 'var(--sage-l)' } : undefined}>
                <span className="ic">{x.icon}</span>
                <span>{x.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 10 }}>
        <button className="btn big sage" onClick={onNext}>
          {nextLabel} <span className="kbd">Enter</span>
        </button>
        {onResolveNext && spot.nextCard != null && (
          <button className="btn secondary" onClick={onResolveNext} title={`This spot was solved assuming one ${spot.street === 'flop' ? 'turn' : 'river'} card. Pick another to see how the strategy changes.`}>
            🔁 Re-solve for another {spot.street === 'flop' ? 'turn' : 'river'}
          </button>
        )}
        {onTwin && (
          <>
            {spot.board.length > 0 && (
              <button className="btn secondary" onClick={() => onTwin('card')} title="Same earlier cards and line; a different last card. Compare how the strategy shifts.">
                👯 Twin: new {STREET_LABEL[spot.street].toLowerCase()} card
              </button>
            )}
            <button className="btn secondary" onClick={() => onTwin('villain')} title="Same spot against a different villain personality.">
              🎭 Twin: new villain
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function TwinCompare({ spot, twin }: { spot: SpotPackage; twin: TwinContext }) {
  const a = freqSummary(twin.spot, twin.spot.solution.strategy);
  const b = freqSummary(spot, spot.solution.strategy);
  const lastA = twin.spot.board[twin.spot.board.length - 1];
  const lastB = spot.board[spot.board.length - 1];
  // Same board, different assumed next card: label by the assumed card instead of the board.
  const sameBoard = twin.spot.board.join() === spot.board.join();
  const nextName = spot.street === 'flop' ? 'turn' : 'river';
  const cardLabel = (c: number | undefined, s: SpotPackage) =>
    sameBoard && s.nextCard != null ? `${nextName} ${cardPretty(s.nextCard)} assumed` : c == null ? 'preflop' : `${STREET_LABEL[spot.street].toLowerCase()} ${cardPretty(c)}`;
  return (
    <div className="panel" style={{ background: 'var(--sky-l)' }}>
      <div className="panel-title">
        <h3>👯 Spot the difference</h3>
        <span className="tag sky">{twin.label}</span>
      </div>
      <div className="col" style={{ gap: 8 }}>
        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Before · {cardLabel(lastA, twin.spot)} · {PROFILES[twin.spot.profile].emoji} {PROFILES[twin.spot.profile].name}
          </div>
          <FreqLine items={a} />
        </div>
        <div>
          <div className="small" style={{ fontWeight: 800 }}>
            Now · {cardLabel(lastB, spot)} · {PROFILES[spot.profile].emoji} {PROFILES[spot.profile].name}
          </div>
          <FreqLine items={b} />
        </div>
        <div className="small muted">Comparing near-identical spots is one of the fastest ways to learn which features actually change the answer.</div>
      </div>
    </div>
  );
}
