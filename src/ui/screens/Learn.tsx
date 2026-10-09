import { PROFILES, PROFILE_IDS } from '../../engine/profiles';
import { useNav } from '../nav';

const SIZES = [0.33, 0.5, 0.75, 1, 1.5, 2];

const RESEARCH: { icon: string; title: string; what: string; cite: string }[] = [
  {
    icon: '🎲',
    title: 'Grade decisions, not results',
    what: 'Poker is a "wicked" learning environment: outcomes are noisy, so experience alone teaches slowly and sometimes teaches the wrong lesson. Every score here is based on expected value, never on whether you happened to win the hand.',
    cite: 'Hogarth (2001) Educating Intuition; Kahneman & Klein (2009) American Psychologist',
  },
  {
    icon: '✍️',
    title: 'Commit before you see',
    what: 'You build your whole range before your hand is revealed. Generating an answer, even a wrong one, before feedback makes the correction stick better than reading the answer.',
    cite: 'Slamecka & Graf (1978); Kornell, Hays & Bjork (2009); Richland, Kornell & Kao (2009)',
  },
  {
    icon: '🌱',
    title: 'Spaced repetition (the garden)',
    what: 'Each decision type × board texture is a plant with its own review schedule. Reviews come back just before you would forget, and intervals stretch as you improve.',
    cite: 'Cepeda et al. (2006) Psychological Bulletin meta-analysis; Dunlosky et al. (2013)',
  },
  {
    icon: '🔀',
    title: 'Interleaving, with blocking for brand-new ideas',
    what: 'Training mixes spot families instead of repeating one. Interleaving helps you tell similar-looking spots apart (average benefit g ≈ 0.42 across 59 studies), but blocking can help when categories are very different or brand new, so Drills offer both.',
    cite: 'Kornell & Bjork (2008); Rohrer & Taylor (2007); Brunmair & Richter (2019) Psych. Bulletin; Carvalho & Goldstone (2014)',
  },
  {
    icon: '👯',
    title: 'Contrasting twins',
    what: 'Twin spots change one thing (the river card or the villain) and keep everything else. Comparing near-identical cases is one of the most reliable ways to learn which features actually matter.',
    cite: 'Schwartz & Bransford (1998); Gentner, Loewenstein & Thompson (2003); Alfieri, Nokes-Malach & Schunn (2013) meta-analysis',
  },
  {
    icon: '⚡',
    title: 'Fluency through fast classification',
    what: 'Blitz trains instant recognition with many short trials, and the garden tracks speed as well as accuracy. Perceptual-learning research suggests this builds expert-like pattern pickup that slow study alone does not.',
    cite: 'Kellman & Garrigan (2009); Kellman, Massey & Son (2010); Mettler, Massey & Kellman (2016) JEP: General',
  },
  {
    icon: '🎯',
    title: 'Aim for about 85% success',
    what: 'Practice that is too easy or too hard teaches little. The villain mix gets tougher when you are cruising and gentler when you are struggling, nudging you toward the sweet spot.',
    cite: 'Bjork (1994) desirable difficulties; Wilson, Shenhav, Straccia & Cohen (2019) Nature Communications',
  },
  {
    icon: '😎',
    title: 'Confidence and hypercorrection',
    what: 'You rate your confidence when locking in. Confident mistakes are corrected especially well once you see feedback, so they are brought back sooner, and the Progress page shows your calibration.',
    cite: 'Butterfield & Metcalfe (2001); Metcalfe (2017) Annual Review of Psychology',
  },
  {
    icon: '💬',
    title: 'Feedback that explains the task',
    what: 'Feedback points at the decision (which hands, which frequencies, why) rather than at you. Elaborated, task-focused feedback beats a bare right/wrong, and ego-focused feedback can even hurt.',
    cite: 'Kluger & DeNisi (1996); Hattie & Timperley (2007); Shute (2008)',
  },
  {
    icon: '🧗',
    title: 'Guides that fade',
    what: 'Theory markers (bluff %, MDF, pot odds) help beginners but become a crutch for experts, so they fade automatically once a family is mastered.',
    cite: 'Kalyuga et al. (2003) expertise reversal; Renkl & Atkinson (2003) fading',
  },
  {
    icon: '🔢',
    title: 'Counts, not just percentages',
    what: 'The readout shows "12 value : 5 bluff combos" alongside the percentages. Natural frequencies make probabilistic reasoning much easier.',
    cite: 'Gigerenzer & Hoffrage (1995) Psychological Review',
  },
  {
    icon: '🏋️',
    title: 'Deliberate practice still matters',
    what: 'Practice explains roughly a quarter of skill differences in games: a big chunk, not everything. In chess, serious solo study predicted skill better than tournament play. Focused drills plus feedback beat volume alone.',
    cite: 'Ericsson, Krampe & Tesch-Römer (1993); Macnamara, Hambrick & Oswald (2014); Charness et al. (2005)',
  },
  {
    icon: '🐦',
    title: 'The Woodpecker, adapted',
    what: 'Repeating a fixed set faster each cycle builds speed, but the benefit of drilling identical items fades over weeks, and memorising a picture is not the same as learning a pattern. Mirror mode keeps the strategy and changes the suits; pair it with rest days between cycles.',
    cite: 'Smith & Tikkanen (2018) The Woodpecker Method; Rohrer et al. (2005) overlearning',
  },
  {
    icon: '🎁',
    title: 'Rewards that support, not control',
    what: 'Gamification has small-to-medium positive effects on learning, but expected tangible rewards can crowd out intrinsic motivation. Here rewards are cosmetic and informational (mastery, improvement), and you choose what to practise.',
    cite: 'Sailer & Homner (2020) Educational Psychology Review; Deci, Koestner & Ryan (1999); Ryan & Deci (2000)',
  },
];

export function Learn() {
  const go = useNav((s) => s.go);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h1>📚 Learn</h1>
        <p className="muted">The handful of formulas the live readout is built on, and the learning science behind how the app trains you.</p>
      </div>

      <div className="learn-grid">
        <div className="panel learn-card">
          <h3>💸 Pot odds</h3>
          <p>To call a bet you need equity of at least</p>
          <div className="formula">call ÷ (pot after their bet + call)</div>
          <p>Facing a 75% pot bet, you need 0.75 ÷ 2.5 = 30% equity against their betting range.</p>
        </div>
        <div className="panel learn-card">
          <h3>🛡️ Minimum defence frequency</h3>
          <div className="formula">MDF = pot ÷ (pot + bet)</div>
          <p>Continue with less than this and any two cards become a profitable bluff for them. It assumes a balanced opponent: defend more vs over-bluffers, less vs nits.</p>
        </div>
        <div className="panel learn-card">
          <h3>⚖️ Value-to-bluff ratio</h3>
          <p>A polarised bet of s × pot makes a bluff-catcher indifferent when bluffs make up</p>
          <div className="formula">s ÷ (1 + 2s) of the betting range</div>
          <table className="compare-table" style={{ marginTop: 6 }}>
            <thead>
              <tr>
                <th>Bet size</th>
                <th>Bluffs</th>
                <th>Villain MDF</th>
              </tr>
            </thead>
            <tbody>
              {SIZES.map((s) => (
                <tr key={s}>
                  <td>{Math.round(s * 100)}% pot</td>
                  <td className="num">{Math.round((100 * s) / (1 + 2 * s))}%</td>
                  <td className="num">{Math.round(100 / (1 + s))}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">Real solver ranges aren't perfectly polarised (thin value muddies it), so treat theory as a compass, not a target.</p>
        </div>
        <div className="panel learn-card">
          <h3>🏔️ Range and nut advantage</h3>
          <ul>
            <li>
              <b>Equity advantage</b>: your whole range wins more often. Favours betting more often.
            </li>
            <li>
              <b>Nut advantage</b>: you hold more of the very best hands. Favours big bets and overbets.
            </li>
            <li>When villain has more nuts, check more and size down; your checking range needs strong hands too.</li>
          </ul>
        </div>
        <div className="panel learn-card">
          <h3>🔑 Blockers</h3>
          <ul>
            <li>Good bluffs block the hands that call (and don't block the ones that fold).</li>
            <li>Good bluff-catchers block value bets and leave their bluffs alone.</li>
            <li>Holding the ace of the flush suit is the classic blocker on flush-heavy rivers.</li>
          </ul>
        </div>
        <div className="panel learn-card">
          <h3>🐾 The villains</h3>
          <ul>
            {PROFILE_IDS.map((p) => (
              <li key={p}>
                {PROFILES[p].emoji} <b>{PROFILES[p].name}</b> ({PROFILES[p].style}): {PROFILES[p].exploit}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <h2>🧠 How Range Den trains you</h2>
        <p className="muted small">Each feature maps to a finding from learning research. Citations are for the curious.</p>
      </div>
      <div className="learn-grid">
        {RESEARCH.map((r) => (
          <div key={r.title} className="panel learn-card">
            <h3>
              <span>{r.icon}</span>
              {r.title}
            </h3>
            <p>{r.what}</p>
            <div className="tiny muted">{r.cite}</div>
          </div>
        ))}
      </div>

      <div className="panel learn-card">
        <h3>🤖 Where the answers come from</h3>
        <p>
          Each spot's flop and turn are simulated with simple, believable heuristics to produce the two river ranges. The river is then solved exactly for that game tree
          (check, 33%, 75% and all-in bets, one raise) with Discounted CFR, the algorithm family behind modern poker AIs, inside a Web Worker in your browser. Against the Wise Owl you
          are compared with the equilibrium; against the other villains, with the best response to their tendencies.
        </p>
        <div className="tiny muted">Zinkevich et al. (2007) CFR; Brown & Sandholm (2019) Discounted CFR; Chen & Ankenman (2006) The Mathematics of Poker</div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => go('train', { kind: 'regular' })}>
          Put it into practice
        </button>
      </div>
    </div>
  );
}
