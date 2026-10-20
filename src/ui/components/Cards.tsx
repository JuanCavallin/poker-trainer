import { RANKS, SUIT_SYMBOLS, rankOf, suitOf } from '../../engine/cards';
import { comboC1, comboC2 } from '../../engine/combos';
import { useStore } from '../../state/store';

export function PlayingCard({ card, size = 46, flip = false, delay = 0 }: { card: number; size?: number; flip?: boolean; delay?: number }) {
  const fourColor = useStore((s) => s.settings.fourColor);
  const r = rankOf(card);
  const s = suitOf(card);
  return (
    <div
      className={`pcard s${s}${fourColor ? '' : ' classic'}${flip ? ' flip' : ''}`}
      style={{ ['--w' as string]: `${size}px`, animationDelay: `${delay}ms` }}
      aria-label={`${RANKS[r]}${'cdhs'[s]}`}
    >
      <span className="r">{RANKS[r] === 'T' ? '10' : RANKS[r]}</span>
      <span className="s">{SUIT_SYMBOLS[s]}</span>
    </div>
  );
}

export function CardBack({ size = 46 }: { size?: number }) {
  const back = useStore((s) => s.cosmetics.back);
  return <div className={`pcard back ${back}`} style={{ ['--w' as string]: `${size}px` }} />;
}

/** Inline coloured card text like A♠K♠. */
export function CardText({ cards }: { cards: number[] }) {
  const fourColor = useStore((s) => s.settings.fourColor);
  return (
    <span className="ctext">
      {cards.map((c, i) => {
        const s = suitOf(c);
        const cls = fourColor ? `s${s}` : s === 1 || s === 2 ? 's2' : 's3';
        return (
          <span key={i} className={cls}>
            {RANKS[rankOf(c)]}
            {SUIT_SYMBOLS[s]}
          </span>
        );
      })}
    </span>
  );
}

export const ComboText = ({ combo }: { combo: number }) => <CardText cards={[comboC1[combo], comboC2[combo]]} />;
