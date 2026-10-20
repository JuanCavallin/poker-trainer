import { POSITIONS, POSITION_NAMES, isEarlier, isOopVs, type Position } from '../../engine/seats';

export type Seat = Position | 'any';

/** One row of seat chips (single choice, with "Any"). */
export function SeatRow({ label, value, onChange, disabled }: { label: string; value: Seat; onChange: (s: Seat) => void; disabled?: Position }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="chipsel">
        <button className={value === 'any' ? 'on' : ''} onClick={() => onChange('any')}>
          🎲 Random
        </button>
        {POSITIONS.map((p) => (
          <button key={p} className={value === p ? 'on' : ''} disabled={p === disabled} onClick={() => onChange(p)} title={POSITION_NAMES[p]}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

/** What two fixed seats mean for who acts first, preflop and postflop. */
export function seatSummary(hero: Seat, villain: Seat): string {
  if (hero === 'any' || villain === 'any' || hero === villain) {
    if (hero !== 'any' && villain === 'any') return `You sit in the ${POSITION_NAMES[hero]}; the villain's seat changes each spot.`;
    if (villain !== 'any' && hero === 'any') return `The villain sits in the ${POSITION_NAMES[villain]}; your seat changes each spot.`;
    return 'Seats are dealt at random each spot, so sometimes you act first and sometimes the villain does.';
  }
  const opens = isEarlier(hero, villain);
  const oop = isOopVs(hero, villain);
  return `${opens ? 'You open first preflop' : 'The villain opens first preflop'}; after the flop you are ${oop ? 'out of position (you act first)' : 'in position (the villain acts first)'}.`;
}

/** Your seat and the villain's seat, each random or fixed. */
export function SeatPicker({ hero, villain, onChange }: { hero: Seat; villain: Seat; onChange: (hero: Seat, villain: Seat) => void }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      <SeatRow label="Your seat" value={hero} onChange={(h) => onChange(h, h !== 'any' && h === villain ? 'any' : villain)} />
      <SeatRow label="Villain's seat" value={villain} onChange={(v) => onChange(v !== 'any' && v === hero ? 'any' : hero, v)} disabled={hero === 'any' ? undefined : hero} />
      <span className="small muted">{seatSummary(hero, villain)}</span>
    </div>
  );
}

export const seatOrUndefined = (s: Seat): Position | undefined => (s === 'any' ? undefined : s);
