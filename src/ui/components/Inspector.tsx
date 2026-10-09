import { rowSum, spotStats, type Strategy } from '../../engine/analysis';
import { classLabel, comboC1, comboC2 } from '../../engine/combos';
import { describeHand } from '../../engine/handinfo';
import type { SpotPackage } from '../../engine/types';
import { ACTION_COLOR, pct } from '../util';
import { ComboText } from './Cards';
import { Modal } from './Overlays';

/** Per-combo editor for one hand class: suits matter for flushes and blockers. */
export function ComboInspector({ spot, cls, strategy, brushMix, onSet, onClose }: { spot: SpotPackage; cls: number; strategy: Strategy; brushMix: number[]; onSet: (ks: number[], mix: number[] | null) => void; onClose: () => void }) {
  const st = spotStats(spot);
  const members = st.classMembers[cls];
  const nA = spot.actions.length;
  return (
    <Modal onClose={onClose}>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>🔍 {classLabel(cls)}</h2>
        <div className="spacer" />
        <button className="btn ghost small" onClick={onClose}>
          ✕
        </button>
      </div>
      <p className="small muted">Suits change everything on the river: flushes, blockers to the nuts, missed draws. Set each combo on its own.</p>
      {members.length === 0 && <div className="empty">This hand isn't in your range here.</div>}
      <div className="col" style={{ gap: 6 }}>
        {members.map((k) => {
          const id = spot.hero.combos[k];
          const d = describeHand(spot.board, comboC1[id], comboC2[id]);
          const sum = rowSum(strategy, k, nA);
          return (
            <div key={k} className="row" style={{ padding: '6px 0', borderBottom: '1px dashed var(--line)', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ width: 52 }}>
                <ComboText combo={id} />
              </span>
              <span className="small" style={{ flex: 1, minWidth: 140 }}>
                {d.label}
                <span className="muted">
                  {' '}
                  · {pct(spot.hero.equity[k])} eq{spot.hero.weights[k] < 0.98 ? ` · ${pct(spot.hero.weights[k])} in range` : ''}
                </span>
              </span>
              <div className="row" style={{ gap: 4 }}>
                {spot.actions.map((a, i) => {
                  const p = sum > 1e-9 ? strategy[k * nA + i] / sum : 0;
                  return (
                    <button
                      key={i}
                      className="btn small secondary"
                      style={{ background: p > 0.001 ? ACTION_COLOR[a.key] : undefined, padding: '4px 8px', fontSize: '0.78rem' }}
                      onClick={() => onSet([k], spot.actions.map((_, j) => (j === i ? 1 : 0)))}
                      title={a.label}
                    >
                      {a.short}
                      {p > 0.001 && p < 0.999 ? ` ${Math.round(p * 100)}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn secondary small" onClick={() => onSet(members, null)}>
          Clear class
        </button>
        <div className="spacer" />
        <button className="btn small" onClick={() => onSet(members, brushMix)}>
          Apply brush to all {members.length}
        </button>
      </div>
    </Modal>
  );
}
