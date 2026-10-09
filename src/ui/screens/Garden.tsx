import { TEXTURES, TEXTURE_IDS } from '../../engine/texture';
import { NODE_TYPES, NODE_TYPE_INFO, familyKey } from '../../engine/types';
import { familyUnlockLevel } from '../../learning/families';
import { DAY, STAGE_NAMES, plantStage, retrievability } from '../../learning/memory';
import { levelFromXp } from '../../learning/progress';
import { dueFamilies } from '../../learning/selector';
import { useStore } from '../../state/store';
import { Plant } from '../components/Plant';
import { useNav } from '../nav';
import { pct } from '../util';

export function Garden() {
  const go = useNav((s) => s.go);
  const families = useStore((s) => s.families);
  const xp = useStore((s) => s.xp);
  const unlockAll = useStore((s) => s.settings.unlockAll);
  const level = levelFromXp(xp).level;
  const now = Date.now();
  const due = dueFamilies(families, now);

  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row wrap" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>🌱 Mastery garden</h1>
          <p className="muted" style={{ maxWidth: 720 }}>
            Every plant is a family of spots: one kind of decision on one kind of board. Plants grow as your scores improve and wilt when a review is due, timed just before
            you'd start to forget (spaced repetition). Tap a plant to drill it.
          </p>
        </div>
        <div className="spacer" />
        <button className="btn sky" disabled={!due.length} onClick={() => go('train', { kind: 'review' })}>
          💧 Water {due.length} thirsty plant{due.length === 1 ? '' : 's'}
        </button>
      </div>

      <div className="row wrap small muted" style={{ gap: 14 }}>
        {STAGE_NAMES.map((n, i) => (
          <span key={n} className="row" style={{ gap: 2 }}>
            <Plant stage={i} health={1} hue={30} size={34} /> {n}
          </span>
        ))}
      </div>

      {NODE_TYPES.map((n) => (
        <div key={n} className="panel">
          <div className="panel-title">
            <h3>{NODE_TYPE_INFO[n].label}</h3>
            <span className="muted small">{NODE_TYPE_INFO[n].blurb}</span>
          </div>
          <div className="garden">
            {TEXTURE_IDS.map((t) => {
              const key = familyKey(n, t);
              const f = families[key];
              const need = familyUnlockLevel(key);
              const locked = !unlockAll && need > level;
              const r = retrievability(f, now);
              const stage = plantStage(f);
              const thirsty = !!f && f.reps > 0 && r < 0.9;
              const dueIn = f?.reps ? (f.due - now) / DAY : 0;
              return (
                <button
                  key={key}
                  className={`plant-card${locked ? ' locked' : ''}${thirsty ? ' thirsty' : ''}`}
                  disabled={locked}
                  onClick={() =>
                    go('train', {
                      kind: 'drill',
                      title: `${NODE_TYPE_INFO[n].short} · ${TEXTURES[t].label}`,
                      filters: { nodeTypes: [n], textures: [t], profiles: ['gto'], scenarios: [], order: 'mixed' },
                    })
                  }
                  title={TEXTURES[t].blurb}
                >
                  <Plant stage={locked ? 0 : stage} health={f?.reps ? r : 1} hue={TEXTURES[t].hue} />
                  <span className="name">{TEXTURES[t].label}</span>
                  {locked ? (
                    <span className="tiny muted">🔒 Level {need}</span>
                  ) : f?.reps ? (
                    <>
                      <span className="tiny">
                        {STAGE_NAMES[stage]} · mastery <b>{pct(f.mastery)}</b>
                      </span>
                      <span className="tiny muted">{thirsty ? 'needs water' : dueIn < 1 ? `review in ${Math.max(1, Math.round(dueIn * 24))}h` : `review in ${Math.round(dueIn)}d`} · {f.reps} plays</span>
                    </>
                  ) : (
                    <span className="tiny muted">not planted yet</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
