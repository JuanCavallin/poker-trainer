import { useEffect, useMemo } from 'react';
import { FINDS } from '../../engine/analysis';
import { ALL_FAMILIES, familyHue, familyLabel, familyUnlockLevel, type Focus } from '../../learning/families';
import { plantStage, retrievability } from '../../learning/memory';
import { levelFromXp, titleFor } from '../../learning/progress';
import { QUEST_BONUS } from '../../learning/quests';
import { dueFamilies } from '../../learning/selector';
import { liveStreak, useStore } from '../../state/store';
import { CardText } from '../components/Cards';
import { Sparkline } from '../components/Charts';
import { Modal, celebrate } from '../components/Overlays';
import { Plant } from '../components/Plant';
import { useNav } from '../nav';
import { sfx } from '../sound';
import { timeAgo } from '../util';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late? The fire is still going';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const go = useNav((s) => s.go);
  const s = useStore();
  const lv = levelFromXp(s.xp);
  const now = Date.now();
  const due = dueFamilies(s.families, now);
  const days = liveStreak(s.streak);

  useEffect(() => {
    s.ensureDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recent = s.history.slice(0, 20).map((h) => h.score).reverse();
  const prev = s.history.slice(20, 40);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
  const avgRecent = avg(recent);
  const avgPrev = avg(prev.map((h) => h.score));

  const gardenPreview = useMemo(() => {
    const unlocked = ALL_FAMILIES.filter((f) => s.settings.unlockAll || familyUnlockLevel(f) <= lv.level);
    return unlocked
      .map((f) => ({ f, st: s.families[f], r: retrievability(s.families[f], now) }))
      .sort((a, b) => (a.st?.reps ? a.r : 2) - (b.st?.reps ? b.r : 2))
      .slice(0, 6);
  }, [s.families, s.settings.unlockAll, lv.level, now]);

  const allClaimed = s.quests.quests.length > 0 && s.quests.quests.every((q) => q.claimed);

  return (
    <div className="home">
      <div className="col" style={{ gap: 18 }}>
        <div className="hero-card">
          <span className="deco">🦉</span>
          <div className="small" style={{ fontWeight: 800, opacity: 0.9 }}>
            {greeting()} · Level {lv.level} {titleFor(lv.level)}
          </div>
          <h1>Read their range. Build yours.</h1>
          <p>
            Preflop, flop, turn or river: see the villain's range, paint your own, lock it in, then play the hand you're dealt. Every answer comes from a solver running right in
            your browser.
          </p>
          <div className="seg" style={{ marginTop: 10, background: 'rgba(255,255,255,0.18)' }}>
            {(['all', 'preflop', 'postflop'] as Focus[]).map((fo) => (
              <button key={fo} className={s.settings.focus === fo ? 'on' : ''} onClick={() => s.updateSettings({ focus: fo })} title="What Training deals">
                {fo === 'all' ? '🔀 Every street' : fo === 'preflop' ? '🌰 Preflop' : '🍂 Postflop'}
              </button>
            ))}
          </div>
          <div className="row wrap" style={{ marginTop: 14, gap: 10 }}>
            <button className="btn big" onClick={() => go('train', { kind: 'regular' })}>
              ▶ {s.counters.spots ? 'Continue training' : 'Deal my first spot'}
            </button>
            {due.length > 0 && (
              <button className="btn secondary" style={{ ['--c' as string]: 'rgba(255,255,255,0.18)', ['--cd' as string]: 'rgba(0,0,0,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.4)' }} onClick={() => go('train', { kind: 'review' })}>
                💧 Water {due.length} thirsty plant{due.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
          <div style={{ marginTop: 16, maxWidth: 420 }}>
            <div className="row small" style={{ justifyContent: 'space-between', fontWeight: 700 }}>
              <span>XP</span>
              <span>
                {lv.into} / {lv.span}
              </span>
            </div>
            <div className="progress" style={{ background: 'rgba(255,255,255,0.25)', borderColor: 'transparent' }}>
              <div style={{ width: `${(lv.into / lv.span) * 100}%`, background: '#fffaf3' }} />
            </div>
          </div>
        </div>

        <div className="mode-grid">
          <button className="mode-card" onClick={() => go('train', { kind: 'regular' })}>
            <span className="ic">🎯</span>
            <h3>Training</h3>
            <p>Adaptive mix: reviews when they're due, new spots as you unlock them, weak spots more often.</p>
          </button>
          <button className="mode-card" onClick={() => go('drills')}>
            <span className="ic">🧪</span>
            <h3>Drills</h3>
            <p>Pick a position, texture, villain or concept and repeat it until it clicks.</p>
          </button>
          <button className="mode-card" onClick={() => go('blitz')}>
            <span className="ic">⚡</span>
            <h3>Blitz</h3>
            <p>Three minutes, three strikes. Fast single-hand decisions with a rating.</p>
          </button>
          <button className="mode-card" onClick={() => go('woodpecker')}>
            <span className="ic">🐦</span>
            <h3>Woodpecker</h3>
            <p>Re-solve the same set in shrinking time. Best for preflop charts.</p>
          </button>
          <button className="mode-card" onClick={() => go('sketch', { kind: 'sketch' })}>
            <span className="ic">✏️</span>
            <h3>Range Sketch</h3>
            <p>No ranges given: draw the villain's range after every action, then yours in reply. See how close you got at the end.</p>
          </button>
        </div>

        <div className="panel">
          <div className="panel-title">
            <h3>🌱 Your garden</h3>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => go('garden')}>
              Open garden →
            </button>
          </div>
          <div className="row wrap" style={{ gap: 6, justifyContent: 'space-around' }}>
            {gardenPreview.map(({ f, st, r }) => {
              return (
                <div key={f} className="col center" style={{ alignItems: 'center', gap: 0, width: 100 }}>
                  <Plant stage={plantStage(st)} health={st?.reps ? r : 1} hue={familyHue(f)} size={70} />
                  <span className="tiny" style={{ fontWeight: 700, lineHeight: 1.2 }}>
                    {familyLabel(f).street} {familyLabel(f).node}
                    <br />
                    <span className="muted">{familyLabel(f).texture}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 18 }}>
        <div className="panel">
          <div className="panel-title">
            <h3>📜 Today's quests</h3>
            <div className="spacer" />
            <span className="tag fire">🔥 {days} day{days === 1 ? '' : 's'}</span>
          </div>
          {s.quests.quests.map((q) => {
            const done = q.progress >= q.target;
            return (
              <div key={q.id} className="quest">
                <span className="e">{q.emoji}</span>
                <div className="body">
                  <span className="label">{q.label}</span>
                  <div className="progress sage">
                    <div style={{ width: `${(q.progress / q.target) * 100}%` }} />
                  </div>
                </div>
                {q.claimed ? (
                  <span className="tag sage">✓</span>
                ) : done ? (
                  <button
                    className="btn small"
                    onClick={() => {
                      s.claimQuest(q.id);
                      sfx.good();
                      celebrate(0.5);
                    }}
                  >
                    +{q.xp} XP
                  </button>
                ) : (
                  <span className="muted small num">
                    {q.progress}/{q.target}
                  </span>
                )}
              </div>
            );
          })}
          {allClaimed && !s.quests.bonusClaimed && (
            <button
              className="btn block sage"
              style={{ marginTop: 10 }}
              onClick={() => {
                s.claimBonus();
                sfx.level();
                celebrate(1.2);
              }}
            >
              🎁 Open the daily chest (+{QUEST_BONUS.xp} XP, +{QUEST_BONUS.chips} 🪙)
            </button>
          )}
          {s.quests.bonusClaimed && <div className="small muted center" style={{ marginTop: 8 }}>All done for today. See you tomorrow! 🌙</div>}
        </div>

        <div className="panel">
          <div className="panel-title">
            <h3>📈 Lately</h3>
          </div>
          <div className="statgrid">
            <div className="stat-tile">
              <div className="k">Spots</div>
              <div className="v">{s.counters.spots}</div>
            </div>
            <div className="stat-tile">
              <div className="k">Avg score (20)</div>
              <div className="v">{Number.isFinite(avgRecent) ? avgRecent.toFixed(0) : '–'}</div>
              {Number.isFinite(avgPrev) && Number.isFinite(avgRecent) && (
                <div className={`d ${avgRecent >= avgPrev ? 'up' : 'down'}`}>
                  {avgRecent >= avgPrev ? '▲' : '▼'} {Math.abs(avgRecent - avgPrev).toFixed(1)} vs before
                </div>
              )}
            </div>
            <div className="stat-tile">
              <div className="k">Blitz best</div>
              <div className="v">{s.counters.blitzBest}</div>
            </div>
          </div>
          {recent.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <Sparkline values={recent} width={300} height={40} />
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel-title">
            <h3>📸 Highlight reel</h3>
            <div className="spacer" />
            <button className="btn ghost small" onClick={() => go('trophies')}>
              All →
            </button>
          </div>
          {s.scrapbook.length === 0 && <div className="small muted">Hero calls, brave bluffs, thin value bets and big laydowns land here.</div>}
          {s.scrapbook.slice(0, 3).map((sc) => (
            <div key={sc.id} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)' }}>
              <span style={{ fontSize: '1.4rem' }}>{FINDS[sc.find].emoji}</span>
              <div style={{ flex: 1 }}>
                <b className="small">{FINDS[sc.find].title}</b>
                <div className="tiny muted">
                  <CardText cards={sc.board} /> · {sc.action} · {timeAgo(sc.ts)}
                </div>
              </div>
              <button className="btn secondary small" onClick={() => go('train', { kind: 'replay', request: sc.request, title: `Replay: ${FINDS[sc.find].title}` })}>
                Replay
              </button>
            </div>
          ))}
        </div>
      </div>

      {!s.seenIntro && <Welcome onClose={() => s.markIntroSeen()} />}
    </div>
  );
}

function Welcome({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose}>
      <div className="center" style={{ fontSize: '3rem' }}>🦉🃏🔥</div>
      <h2 className="center">Welcome to Range Den</h2>
      <p>A cozy place to get genuinely better at heads-up poker, from preflop to the river. Each spot runs like this:</p>
      <div className="col" style={{ gap: 10, margin: '12px 0' }}>
        <div className="insight">
          <span className="ic">👀</span>
          <span>
            <b>Read the villain.</b> You see their range and their latest action before anything else.
          </span>
        </div>
        <div className="insight">
          <span className="ic">🎨</span>
          <span>
            <b>Paint your range.</b> Decide what every hand in your range does. The live readout shows bluff %, value %, defence vs MDF and range advantage as you go.
          </span>
        </div>
        <div className="insight">
          <span className="ic">🃏</span>
          <span>
            <b>Play your hand.</b> You're dealt a real hand from your range. Confirm the action and see how both your range and your hand score.
          </span>
        </div>
      </div>
      <p className="small muted">
        Under the hood: spaced repetition (your garden), interleaved spots, confidence ratings, contrast "twin" spots and Range Sketch, all borrowed from learning research. See the Learn tab for the why.
      </p>
      <button className="btn big block" onClick={onClose}>
        Let's go
      </button>
    </Modal>
  );
}
