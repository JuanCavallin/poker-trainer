import { FINDS } from '../../engine/analysis';
import { comboC1, comboC2 } from '../../engine/combos';
import { ACHIEVEMENTS } from '../../learning/achievements';
import { familyLabel } from '../../learning/families';
import { useStore } from '../../state/store';
import { CardText } from '../components/Cards';
import { useNav } from '../nav';
import { timeAgo } from '../util';

export function Trophies() {
  const go = useNav((s) => s.go);
  const state = useStore();
  const unlocked = ACHIEVEMENTS.filter((a) => state.achievements[a.id]).length;
  return (
    <div className="col" style={{ gap: 18 }}>
      <div>
        <h1>🏆 Trophy shelf</h1>
        <p className="muted">
          {unlocked} of {ACHIEVEMENTS.length} achievements unlocked.
        </p>
      </div>
      <div className="trophy-grid">
        {ACHIEVEMENTS.map((a) => {
          const got = state.achievements[a.id];
          const v = Math.min(a.target, a.value(state));
          return (
            <div key={a.id} className={`trophy${got ? '' : ' locked'}`}>
              <span className="e">{a.emoji}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{a.name}</b>
                <div className="tiny muted">{a.desc}</div>
                {!got && (
                  <div className="progress" style={{ marginTop: 4, height: 6 }}>
                    <div style={{ width: `${(v / a.target) * 100}%` }} />
                  </div>
                )}
                <div className="tiny muted">{got ? `unlocked ${timeAgo(got)}` : `${v}/${a.target} · +${a.chips} 🪙`}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>📸 Scrapbook</h2>
        <p className="small muted">Your best moments. Replay any of them as a full range-building spot.</p>
        {state.scrapbook.length === 0 && <div className="empty">No highlights yet. Hero calls, brave bluffs and big laydowns end up here.</div>}
        {state.scrapbook.map((s) => (
          <div key={s.id} className="scrap">
            <span style={{ fontSize: '1.6rem' }}>{FINDS[s.find].emoji}</span>
            <div className="small">
              <b>{FINDS[s.find].title}</b> · <CardText cards={[comboC1[s.combo], comboC2[s.combo]]} /> on <CardText cards={s.board} /> · {s.action}
              <div className="tiny muted">
                {familyLabel(s.family).full} · {timeAgo(s.ts)}
              </div>
            </div>
            <button className="btn secondary small" onClick={() => go('train', { kind: 'replay', request: s.request, title: `Replay: ${FINDS[s.find].title}` })}>
              Replay
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
