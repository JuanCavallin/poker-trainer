import { RANKS, makeCard } from '../../engine/cards';
import { Modal } from './Overlays';
import { PlayingCard } from './Cards';

/** Pick one card from the deck; cards already on the board are unavailable. */
export function CardPicker({ title, blurb, used, current, onPick, onClose }: { title: string; blurb?: string; used: readonly number[]; current?: number; onPick: (card: number) => void; onClose: () => void }) {
  const ranks = Array.from({ length: 13 }, (_, i) => 12 - i);
  return (
    <Modal onClose={onClose} wide>
      <div className="row" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <div className="spacer" />
        <button className="btn ghost small" onClick={onClose}>
          ✕
        </button>
      </div>
      {blurb && <p className="small muted">{blurb}</p>}
      <div className="card-picker">
        {[3, 2, 1, 0].map((suit) =>
          ranks.map((rank) => {
            const c = makeCard(rank, suit);
            const taken = used.includes(c);
            return (
              <button
                key={c}
                className={`pick${c === current ? ' on' : ''}`}
                disabled={taken}
                onClick={() => onPick(c)}
                title={taken ? 'On the board' : `${RANKS[rank]}${'cdhs'[suit]}`}
              >
                <PlayingCard card={c} size={34} />
              </button>
            );
          }),
        )}
      </div>
    </Modal>
  );
}
