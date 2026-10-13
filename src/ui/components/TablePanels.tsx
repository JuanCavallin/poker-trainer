import { BUCKETS, bucketOf, spotStats } from '../../engine/analysis';
import { PROFILES } from '../../engine/profiles';
import { TEXTURES } from '../../engine/texture';
import { NODE_TYPE_INFO, STREET_LABEL, type SpotPackage } from '../../engine/types';
import { cosmeticById } from '../../state/cosmetics';
import { useStore } from '../../state/store';
import { bb, pct } from '../util';
import { CardText, PlayingCard } from './Cards';
import { RangeGrid } from './RangeGrid';

export function useFelt() {
  const felt = useStore((s) => s.cosmetics.felt);
  const item = cosmeticById(felt);
  return item?.colors ?? ['#4a9a74', '#2c6b50'];
}

export function TablePanel({ spot, bubble, heroCards }: { spot: SpotPackage; bubble?: string | null; heroCards?: number[] }) {
  const [fa, fb] = useFelt();
  const companion = useStore((s) => cosmeticById(s.cosmetics.companion));
  const profile = PROFILES[spot.profile];
  return (
    <div>
      <div className="felt" style={{ ['--felt-a' as string]: fa, ['--felt-b' as string]: fb }}>
        {companion && (
          <span className="companion" title={companion.name}>
            {companion.emoji}
          </span>
        )}
        <div className="row tiny" style={{ opacity: 0.85, fontWeight: 800, letterSpacing: 0.3 }}>
          <span>
            {spot.scenario.name} · {spot.scenario.potType}
          </span>
          <span className="spacer" />
          <span>{STREET_LABEL[spot.street].toUpperCase()}</span>
        </div>
        <div className="board">
          {spot.board.map((c, i) => (
            <div key={i} style={{ marginLeft: i === 3 || i === 4 ? 4 : 0 }}>
              <PlayingCard card={c} size={44} />
            </div>
          ))}
          {Array.from({ length: 5 - spot.board.length }, (_, i) => (
            <div key={`e${i}`} className="pcard empty-slot" style={{ ['--w' as string]: '44px' }} />
          ))}
        </div>
        <div className="pot">
          <span className="chipstack" /> Pot {bb(spot.pot)}
          {spot.toCall > 0 && <small> · {bb(spot.toCall)} to call</small>}
        </div>
        <div className="seats">
          <div className="seat">
            <span>{profile.emoji}</span>
            <span>
              <b>{spot.villainPos}</b> · {bb(spot.villainBehind, 0)}
            </span>
          </div>
          <div className="seat">
            {heroCards ? <CardText cards={heroCards} /> : <span>🫵</span>}
            <span>
              <b>You ({spot.heroPos})</b> · {bb(spot.heroBehind, 0)}
            </span>
          </div>
        </div>
      </div>
      {companion && bubble && (
        <div className="bubble" key={bubble}>
          <b>{companion.name.split(' ')[0]}:</b> {bubble}
        </div>
      )}
    </div>
  );
}

export function HistoryPanel({ spot }: { spot: SpotPackage }) {
  return (
    <div className="panel">
      <div className="panel-title">
        <h3>📜 How we got here</h3>
      </div>
      <div className="history">
        {spot.history.map((h) => (
          <div key={h.street} className={`street${h.street.toLowerCase() === spot.street ? ' river' : ''}`}>
            <b>{h.street}</b>
            <span>
              {h.cards.length > 0 && (
                <>
                  <CardText cards={h.cards} />{' '}
                </>
              )}
              {h.street !== 'Preflop' && <span className="muted">({bb(h.pot)}) </span>}
              {h.lines.join(' → ') || (h.street.toLowerCase() === spot.street ? 'Your move' : '')}
              {h.street.toLowerCase() === spot.street && h.lines.length > 0 && <span className="muted"> → your move</span>}
            </span>
          </div>
        ))}
      </div>
      <div className="row wrap" style={{ marginTop: 10, gap: 6 }}>
        <span className="tag honey">{NODE_TYPE_INFO[spot.nodeType].label}</span>
        {spot.street !== 'preflop' && <span className="tag sage">{TEXTURES[spot.texture.id].label}</span>}
        <span className="tag">{spot.heroIp ? 'You are in position' : 'You are out of position'}</span>
        {spot.texture.tags.slice(0, 2).map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function VillainPanel({ spot, showGrid = true }: { spot: SpotPackage; showGrid?: boolean }) {
  const st = spotStats(spot);
  const profile = PROFILES[spot.profile];
  const shares = BUCKETS.map(() => 0);
  for (let j = 0; j < spot.villain.n; j++) shares[bucketOf(spot.villain.equity[j])] += spot.villain.weights[j];
  const total = shares.reduce((a, b) => a + b, 0);
  return (
    <div className="panel">
      <div className="persona">
        <div className="face">{profile.emoji}</div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0 }}>{profile.name}</h3>
          <div className="small muted">
            {profile.style} · {spot.villainPos}
          </div>
        </div>
      </div>
      <div className="action-callout">
        <span style={{ fontSize: '1.3rem' }}>{spot.villainAction.kind === 'check' ? '✋' : spot.villainAction.kind === 'none' ? '⏳' : '💰'}</span>
        <span>
          {spot.heroPrior && <span className="muted small">{spot.heroPrior}. </span>}
          {spot.villainAction.label}
        </span>
      </div>
      <div style={{ marginTop: 12 }}>
        <div className="row small" style={{ marginBottom: 6 }}>
          <b>Their range here</b>
          <span className="spacer" />
          <span className="muted num">{total.toFixed(1)} combos</span>
        </div>
        <div className="compbar">
          {BUCKETS.map((b, i) =>
            shares[i] > 0 ? (
              <div key={b.key} style={{ width: `${(shares[i] / total) * 100}%`, background: b.color }} title={`${b.label}: ${pct(shares[i] / total)}`}>
                {shares[i] / total > 0.1 ? pct(shares[i] / total) : ''}
              </div>
            ) : null,
          )}
        </div>
        <div className="legend" style={{ marginTop: 6 }}>
          {BUCKETS.map((b) => (
            <span key={b.key}>
              <i style={{ background: b.color }} />
              {b.label}
            </span>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 4 }}>
          Colours show each villain hand's {spot.street === 'river' ? 'equity' : 'all-in equity'} against <i>your</i> range.{' '}
          {spot.street === 'river' ? `Villain bluffs ≈ ${pct(st.villainBluffShare)} of this range.` : `${pct(st.villainBluffShare)} of this range is behind yours right now.`}
        </div>
      </div>
      {showGrid && (
        <div style={{ marginTop: 10 }}>
          <RangeGrid spot={spot} mode="villain" mini />
        </div>
      )}
      {spot.hud && (
        <div className="hud">
          <div className="small" style={{ fontWeight: 800, marginTop: 6 }}>
            🗒️ Your notes on {profile.name}
          </div>
          {spot.hud.stats.map((s) => (
            <div key={s.label} className="stat">
              <span>{s.label}</span>
              <span className="num">
                <b>{pct(s.value)}</b> <span className="muted">(balanced {pct(s.baseline)})</span>
              </span>
            </div>
          ))}
          <div className="tiny muted">{profile.exploit}</div>
        </div>
      )}
    </div>
  );
}
