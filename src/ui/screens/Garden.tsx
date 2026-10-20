import { useState } from 'react';
import { POSITION_NAMES, type Position } from '../../engine/seats';
import { TEXTURES, type TextureId } from '../../engine/texture';
import { NODE_TYPE_INFO, STREETS, STREET_LABEL, familyKey, nodeTypesFor, type PreflopNode, type Street } from '../../engine/types';
import { PREFLOP_SEATS, columnLabel, columnsFor, familyHue, familyUnlockLevel } from '../../learning/families';
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
  const [street, setStreet] = useState<Street>('preflop');
  const dueOn = (st: Street) => dueFamilies(families, now, [st]).length;

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

      <div className="tabs">
        {STREETS.map((st) => (
          <button key={st} className={street === st ? 'on' : ''} onClick={() => setStreet(st)}>
            {STREET_LABEL[st]}
            {dueOn(st) > 0 && <span className="tag sky" style={{ marginLeft: 6 }}>💧 {dueOn(st)}</span>}
          </button>
        ))}
      </div>

      {nodeTypesFor(street).map((n) => (
        <div key={n} className="panel">
          <div className="panel-title">
            <h3>{NODE_TYPE_INFO[n].label}</h3>
            <span className="muted small">{NODE_TYPE_INFO[n].blurb}</span>
          </div>
          <div className="garden">
            {columnsFor(street)
              .filter((t) => street !== 'preflop' || PREFLOP_SEATS[n as PreflopNode].includes(t as Position))
              .map((t) => {
              const key = familyKey(street, n, t);
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
                      title: `${STREET_LABEL[street]} · ${NODE_TYPE_INFO[n].short} · ${columnLabel(street, t)}`,
                      filters: {
                        streets: [street],
                        nodeTypes: [n],
                        textures: street === 'preflop' ? [] : [t as TextureId],
                        heroSeats: street === 'preflop' ? [t as Position] : [],
                        villainSeats: [],
                        potTypes: [],
                        profiles: ['gto'],
                        order: 'mixed',
                      },
                    })
                  }
                  title={street === 'preflop' ? POSITION_NAMES[t as Position] : TEXTURES[t as TextureId].blurb}
                >
                  <Plant stage={locked ? 0 : stage} health={f?.reps ? r : 1} hue={familyHue(key)} />
                  <span className="name">{columnLabel(street, t)}</span>
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
