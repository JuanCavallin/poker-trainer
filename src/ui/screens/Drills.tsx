import { useState } from 'react';
import { SCENARIOS } from '../../engine/preflop';
import { PROFILES, PROFILE_IDS, type ProfileId } from '../../engine/profiles';
import { TEXTURES, TEXTURE_IDS, type TextureId } from '../../engine/texture';
import { NODE_TYPES, NODE_TYPE_INFO, type NodeType } from '../../engine/types';
import type { DrillFilters } from '../../learning/selector';
import { useNav } from '../nav';

interface Preset {
  emoji: string;
  title: string;
  blurb: string;
  filters: Partial<DrillFilters>;
}

const PRESETS: Preset[] = [
  { emoji: '🛡️', title: 'Bluff-catching', blurb: 'Facing river bets in and out of position. Train MDF and picking the right bluff-catchers.', filters: { nodeTypes: ['ip-vs-bet', 'oop-vs-bet'] } },
  { emoji: '⚖️', title: 'Value : bluff ratios', blurb: 'Checked to you in position: size up, pick bluffs, hit the ratio.', filters: { nodeTypes: ['ip-vs-check'] } },
  { emoji: '🎤', title: 'Leading out of position', blurb: 'First to act on the river: when to lead, when to check, how to protect your checks.', filters: { nodeTypes: ['oop-first'] } },
  { emoji: '🌊', title: 'Flush comes in', blurb: 'The river completes a flush. Who has more of them, and who should bet?', filters: { textures: ['flush-river'] } },
  { emoji: '🌉', title: 'Straight comes in', blurb: 'Rivers that suddenly make straights possible.', filters: { textures: ['straight-river'] } },
  { emoji: '👯', title: 'Paired boards', blurb: 'Trips and boats appear; top pair shrinks.', filters: { textures: ['paired'] } },
  { emoji: '🏜️', title: 'Dry boards', blurb: 'Static boards where ranges stay far apart. Great for fundamentals.', filters: { textures: ['dry'] } },
  { emoji: '💰', title: '3-bet pots', blurb: 'Lower stack-to-pot ratios and stronger ranges.', filters: { scenarios: ['btn-bb-3bp'] } },
  { emoji: '🦥', title: 'Value-bet the Sloth', blurb: 'A calling station: bet thinner, bluff less.', filters: { profiles: ['station'], nodeTypes: ['ip-vs-check', 'oop-first'] } },
  { emoji: '🐰', title: 'Push the Bunny around', blurb: 'A nit who folds too much and only bets the goods.', filters: { profiles: ['nit'] } },
  { emoji: '🦊', title: 'Catch the Fox', blurb: 'An over-bluffer. Call down wider.', filters: { profiles: ['fox'], nodeTypes: ['ip-vs-bet', 'oop-vs-bet'] } },
  { emoji: '🦝', title: 'Tame the Raccoon', blurb: 'A maniac who bets and raises everything.', filters: { profiles: ['maniac'] } },
];

const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

export function Drills() {
  const go = useNav((s) => s.go);
  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([]);
  const [textures, setTextures] = useState<TextureId[]>([]);
  const [profiles, setProfiles] = useState<ProfileId[]>(['gto']);
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [order, setOrder] = useState<'mixed' | 'blocked'>('mixed');

  const start = (f: Partial<DrillFilters>, title: string) =>
    go('train', {
      kind: 'drill',
      title,
      filters: { nodeTypes: f.nodeTypes ?? [], textures: f.textures ?? [], profiles: f.profiles ?? ['gto'], scenarios: f.scenarios ?? [], order: f.order ?? order },
    });

  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h1>🧪 Drills</h1>
        <p className="muted">Focused practice. Concept drills are a good start; the builder lets you combine anything.</p>
      </div>

      <div className="mode-grid">
        {PRESETS.map((p) => (
          <button key={p.title} className="mode-card" onClick={() => start(p.filters, p.title)}>
            <span className="ic">{p.emoji}</span>
            <h3>{p.title}</h3>
            <p>{p.blurb}</p>
          </button>
        ))}
      </div>

      <div className="panel">
        <h2>🛠️ Build a drill</h2>
        <p className="small muted">Leave a row empty to allow everything in it.</p>
        <div className="field">
          <label>Decision</label>
          <div className="chipsel">
            {NODE_TYPES.map((n) => (
              <button key={n} className={nodeTypes.includes(n) ? 'on' : ''} onClick={() => setNodeTypes(toggle(nodeTypes, n))}>
                {NODE_TYPE_INFO[n].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Board texture</label>
          <div className="chipsel">
            {TEXTURE_IDS.map((t) => (
              <button key={t} className={textures.includes(t) ? 'on' : ''} onClick={() => setTextures(toggle(textures, t))} title={TEXTURES[t].blurb}>
                {TEXTURES[t].label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Villain</label>
          <div className="chipsel">
            {PROFILE_IDS.map((p) => (
              <button key={p} className={profiles.includes(p) ? 'on' : ''} onClick={() => setProfiles(toggle(profiles, p))} title={PROFILES[p].blurb}>
                {PROFILES[p].emoji} {PROFILES[p].name}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Preflop scenario</label>
          <div className="chipsel">
            {SCENARIOS.map((s) => (
              <button key={s.id} className={scenarios.includes(s.id) ? 'on' : ''} onClick={() => setScenarios(toggle(scenarios, s.id))}>
                {s.name} {s.potType}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Practice order</label>
          <div className="seg">
            <button className={order === 'mixed' ? 'on' : ''} onClick={() => setOrder('mixed')}>
              🔀 Mixed (recommended)
            </button>
            <button className={order === 'blocked' ? 'on' : ''} onClick={() => setOrder('blocked')}>
              🧱 Blocked
            </button>
          </div>
          <span className="small muted">
            {order === 'mixed'
              ? 'Shuffles your selections every spot. Interleaving similar-looking spots trains you to tell them apart, and it sticks better long-term.'
              : 'Keeps the same combination for four spots in a row. Handy when a concept is brand new; switch to mixed once it starts to click.'}
          </span>
        </div>
        <button className="btn big" onClick={() => start({ nodeTypes, textures, profiles: profiles.length ? profiles : ['gto'], scenarios, order }, 'Custom drill')}>
          ▶ Start drill
        </button>
      </div>
    </div>
  );
}
