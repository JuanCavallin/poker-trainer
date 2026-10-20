import { useState } from 'react';
import { POSITIONS, POSITION_NAMES, type Position } from '../../engine/seats';
import { PROFILES, PROFILE_IDS, type ProfileId } from '../../engine/profiles';
import { TEXTURES, type TextureId } from '../../engine/texture';
import { NODE_TYPES, NODE_TYPE_INFO, PREFLOP_NODE_TYPES, STREETS, STREET_LABEL, type NodeType, type Street } from '../../engine/types';
import { TEXTURES_BY_STREET } from '../../learning/families';
import { emptyFilters, type DrillFilters } from '../../learning/selector';
import { useNav } from '../nav';

interface Preset {
  emoji: string;
  title: string;
  blurb: string;
  filters: Partial<DrillFilters>;
}

const PRESETS: { group: string; items: Preset[] }[] = [
  {
    group: 'Preflop',
    items: [
      { emoji: '🛡️', title: 'Defend the big blind', blurb: 'Facing opens from every seat: fold, call or 3-bet with the widest range at the table.', filters: { streets: ['preflop'], nodeTypes: ['vs-open'], heroSeats: ['BB'] } },
      { emoji: '🦹', title: 'Steal from late position', blurb: 'Open-or-fold from the cutoff, button and small blind, where position does the heavy lifting.', filters: { streets: ['preflop'], nodeTypes: ['rfi'], heroSeats: ['CO', 'BTN', 'SB'] } },
      { emoji: '🧊', title: 'Tight early opens', blurb: 'UTG and hijack: four or five players still to act, so open tighter.', filters: { streets: ['preflop'], nodeTypes: ['rfi'], heroSeats: ['UTG', 'HJ'] } },
      { emoji: '🔁', title: 'Facing 3-bets', blurb: 'You opened and got re-raised: continue wide enough without paying off.', filters: { streets: ['preflop'], nodeTypes: ['vs-3bet'] } },
      { emoji: '💣', title: '4-bets and jams', blurb: 'The deep end of preflop: which 3-bets continue against a 4-bet.', filters: { streets: ['preflop'], nodeTypes: ['vs-4bet'] } },
    ],
  },
  {
    group: 'Flop & turn',
    items: [
      { emoji: '🎯', title: 'C-betting in position', blurb: 'Checked to you on the flop as the preflop raiser: how often, and which size?', filters: { streets: ['flop'], nodeTypes: ['ip-vs-check'] } },
      { emoji: '🧱', title: 'Facing a flop c-bet', blurb: 'Out of position against a continuation bet: fold, float, or check-raise.', filters: { streets: ['flop'], nodeTypes: ['oop-vs-bet'] } },
      { emoji: '🌈', title: 'Monotone flops', blurb: 'Three of a suit on the flop: made flushes, draws and blockers everywhere.', filters: { streets: ['flop'], textures: ['f-monotone'] } },
      { emoji: '🔫', title: 'Turn barrels', blurb: 'Keep firing or give up? Turn decisions after a flop bet was called.', filters: { streets: ['turn'], nodeTypes: ['ip-vs-check', 'oop-first'] } },
      { emoji: '🃏', title: 'Scare cards on the turn', blurb: 'Overcards, flush and straight cards change who has the nuts.', filters: { streets: ['turn'], textures: ['t-overcard', 't-flush', 't-straight'] } },
    ],
  },
  {
    group: 'River',
    items: [
      { emoji: '🛡️', title: 'Bluff-catching', blurb: 'Facing river bets in and out of position. Train MDF and picking the right bluff-catchers.', filters: { streets: ['river'], nodeTypes: ['ip-vs-bet', 'oop-vs-bet'] } },
      { emoji: '⚖️', title: 'Value : bluff ratios', blurb: 'Checked to you in position: size up, pick bluffs, hit the ratio.', filters: { streets: ['river'], nodeTypes: ['ip-vs-check'] } },
      { emoji: '🎤', title: 'Leading out of position', blurb: 'First to act on the river: when to lead, when to check, how to protect your checks.', filters: { streets: ['river'], nodeTypes: ['oop-first'] } },
      { emoji: '🌊', title: 'Flush comes in', blurb: 'The river completes a flush. Who has more of them, and who should bet?', filters: { streets: ['river'], textures: ['flush-river'] } },
      { emoji: '🌉', title: 'Straight comes in', blurb: 'Rivers that suddenly make straights possible.', filters: { streets: ['river'], textures: ['straight-river'] } },
      { emoji: '💰', title: '3-bet pots', blurb: 'Lower stack-to-pot ratios and stronger ranges on every street.', filters: { streets: ['flop', 'turn', 'river'], potTypes: ['3BP'] } },
    ],
  },
  {
    group: 'Villains',
    items: [
      { emoji: '🦥', title: 'Value-bet the Sloth', blurb: 'A calling station: bet thinner, bluff less.', filters: { profiles: ['station'], nodeTypes: ['ip-vs-check', 'oop-first'] } },
      { emoji: '🐰', title: 'Push the Bunny around', blurb: 'A nit who folds too much and only bets the goods.', filters: { profiles: ['nit'] } },
      { emoji: '🦊', title: 'Catch the Fox', blurb: 'An over-bluffer who 3-bets light too. Call down and 4-bet wider.', filters: { profiles: ['fox'], nodeTypes: ['ip-vs-bet', 'oop-vs-bet', 'vs-3bet'] } },
      { emoji: '🦝', title: 'Tame the Raccoon', blurb: 'A maniac who opens, raises and bets everything.', filters: { profiles: ['maniac'] } },
    ],
  },
];

const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function Drills() {
  const go = useNav((s) => s.go);
  const [f, setF] = useState<DrillFilters>(emptyFilters());
  const [sketch, setSketch] = useState(false);
  const set = (patch: Partial<DrillFilters>) => setF({ ...f, ...patch });

  const start = (p: Partial<DrillFilters>, title: string) => {
    const filters = { ...emptyFilters(), order: f.order, ...p };
    if (!filters.profiles.length) filters.profiles = ['gto'];
    go(sketch ? 'sketch' : 'train', sketch ? { kind: 'sketch', filters, title } : { kind: 'drill', title, filters });
  };

  const streets = f.streets.length ? f.streets : STREETS;
  const showPre = streets.includes('preflop');
  const showPost = streets.some((s) => s !== 'preflop');
  const nodeOptions: NodeType[] = [...(showPre ? PREFLOP_NODE_TYPES : []), ...(showPost ? NODE_TYPES : [])];
  const textureStreets = streets.filter((s): s is 'flop' | 'turn' | 'river' => s !== 'preflop');

  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h1>🧪 Drills</h1>
        <p className="muted">Focused practice on one street, seat or idea. Concept drills are a good start; the builder lets you combine anything.</p>
        <div className="seg" style={{ marginTop: 6 }}>
          <button className={!sketch ? 'on' : ''} onClick={() => setSketch(false)}>
            🎨 Build my strategy
          </button>
          <button className={sketch ? 'on' : ''} onClick={() => setSketch(true)}>
            ✏️ Sketch every range
          </button>
        </div>
        {sketch && (
          <p className="small muted" style={{ marginTop: 6 }}>
            Range sketch: no ranges are shown. Draw the villain's range after each of their actions and your own in reply, then see how close you got.
          </p>
        )}
      </div>

      {PRESETS.map((g) => (
        <div key={g.group}>
          <h3 style={{ margin: '0 0 8px' }}>{g.group}</h3>
          <div className="mode-grid">
            {g.items.map((p) => (
              <button key={p.title} className="mode-card" onClick={() => start(p.filters, p.title)}>
                <span className="ic">{p.emoji}</span>
                <h3>{p.title}</h3>
                <p>{p.blurb}</p>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="panel">
        <h2>🛠️ Build a drill</h2>
        <p className="small muted">Leave a row empty to allow everything in it.</p>
        <div className="field">
          <label>Street</label>
          <div className="chipsel">
            {STREETS.map((s: Street) => (
              <button key={s} className={f.streets.includes(s) ? 'on' : ''} onClick={() => set({ streets: toggle(f.streets, s) })}>
                {STREET_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Decision</label>
          <div className="chipsel">
            {nodeOptions.map((n) => (
              <button key={n} className={f.nodeTypes.includes(n) ? 'on' : ''} onClick={() => set({ nodeTypes: toggle(f.nodeTypes, n) })} title={NODE_TYPE_INFO[n].blurb}>
                {NODE_TYPE_INFO[n].label}
              </button>
            ))}
          </div>
        </div>
        {textureStreets.length > 0 && (
          <div className="field">
            <label>Board texture</label>
            {textureStreets.map((st) => (
              <div key={st} className="chipsel" style={{ marginBottom: 4 }}>
                <span className="tiny muted" style={{ alignSelf: 'center', minWidth: 38 }}>
                  {STREET_LABEL[st]}
                </span>
                {TEXTURES_BY_STREET[st].map((t: TextureId) => (
                  <button key={t} className={f.textures.includes(t) ? 'on' : ''} onClick={() => set({ textures: toggle(f.textures, t) })} title={TEXTURES[t].blurb}>
                    {TEXTURES[t].label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
        <div className="field">
          <label>Your seat</label>
          <div className="chipsel">
            {POSITIONS.map((p: Position) => (
              <button key={p} className={f.heroSeats.includes(p) ? 'on' : ''} onClick={() => set({ heroSeats: toggle(f.heroSeats, p) })} title={POSITION_NAMES[p]}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Villain's seat</label>
          <div className="chipsel">
            {POSITIONS.map((p: Position) => (
              <button key={p} className={f.villainSeats.includes(p) ? 'on' : ''} onClick={() => set({ villainSeats: toggle(f.villainSeats, p) })} title={POSITION_NAMES[p]}>
                {p}
              </button>
            ))}
          </div>
          <span className="small muted">Seats decide who acts first: the earlier seat opens preflop, and the blinds act first after the flop. Pick neither to get random seats.</span>
        </div>
        {showPost && (
          <div className="field">
            <label>Pot</label>
            <div className="chipsel">
              {(['SRP', '3BP'] as const).map((p) => (
                <button key={p} className={f.potTypes.includes(p) ? 'on' : ''} onClick={() => set({ potTypes: toggle(f.potTypes, p) })}>
                  {p === 'SRP' ? 'Single-raised' : '3-bet pot'}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="field">
          <label>Villain</label>
          <div className="chipsel">
            {PROFILE_IDS.map((p: ProfileId) => (
              <button key={p} className={f.profiles.includes(p) ? 'on' : ''} onClick={() => set({ profiles: toggle(f.profiles, p) })} title={PROFILES[p].blurb}>
                {PROFILES[p].emoji} {PROFILES[p].name}
              </button>
            ))}
          </div>
          <span className="small muted">Each villain plays its style preflop too: wider or tighter opens, more or fewer 3-bets.</span>
        </div>
        <div className="field">
          <label>Practice order</label>
          <div className="seg">
            <button className={f.order === 'mixed' ? 'on' : ''} onClick={() => set({ order: 'mixed' })}>
              🔀 Mixed (recommended)
            </button>
            <button className={f.order === 'blocked' ? 'on' : ''} onClick={() => set({ order: 'blocked' })}>
              🧱 Blocked
            </button>
          </div>
          <span className="small muted">
            {f.order === 'mixed'
              ? 'Shuffles your selections every spot. Interleaving similar-looking spots trains you to tell them apart, and it sticks better long-term.'
              : 'Keeps the same combination for four spots in a row. Handy when a concept is brand new; switch to mixed once it starts to click.'}
          </span>
        </div>
        <button className="btn big" onClick={() => start(f, sketch ? 'Custom sketch' : 'Custom drill')}>
          ▶ Start {sketch ? 'sketching' : 'drill'}
        </button>
      </div>
    </div>
  );
}
