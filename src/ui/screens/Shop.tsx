import { COSMETICS, type CosmeticKind } from '../../state/cosmetics';
import { useStore } from '../../state/store';
import { celebrate } from '../components/Overlays';
import { sfx } from '../sound';

const SECTIONS: { kind: CosmeticKind; title: string; blurb: string }[] = [
  { kind: 'pet', title: '🐾 Table companions', blurb: 'They sit on your felt and cheer (or wince) at your plays.' },
  { kind: 'felt', title: '🟩 Felts', blurb: 'Recover the table in a new colour.' },
  { kind: 'back', title: '🂠 Card backs', blurb: 'Shown while the dealer shuffles.' },
];

export function Shop() {
  const chips = useStore((s) => s.chips);
  const cos = useStore((s) => s.cosmetics);
  const buy = useStore((s) => s.buy);
  const equip = useStore((s) => s.equip);
  return (
    <div className="col" style={{ gap: 18 }}>
      <div className="row">
        <div>
          <h1>🛍️ The Den shop</h1>
          <p className="muted">Purely cosmetic. Chips come from practice, quests and achievements, never from paying.</p>
        </div>
        <div className="spacer" />
        <span className="pill" style={{ fontSize: '1.1rem' }}>
          🪙 {chips}
        </span>
      </div>
      {SECTIONS.map((sec) => (
        <div key={sec.kind} className="panel">
          <h2>{sec.title}</h2>
          <p className="small muted">{sec.blurb}</p>
          <div className="shop-grid">
            {COSMETICS.filter((c) => c.kind === sec.kind).map((c) => {
              const owned = cos.owned.includes(c.id);
              const equipped = cos.felt === c.id || cos.back === c.id || cos.companion === c.id;
              return (
                <div key={c.id} className={`shop-item${equipped ? ' equipped' : ''}`}>
                  {c.kind === 'felt' && <div className="swatch-felt" style={{ background: `radial-gradient(120% 90% at 50% 20%, ${c.colors![0]}, ${c.colors![1]})` }} />}
                  {c.kind === 'back' && <div className={`pcard back ${c.id}`} style={{ ['--w' as string]: '52px' }} />}
                  {c.kind === 'pet' && <div style={{ fontSize: '2.8rem' }}>{c.emoji}</div>}
                  <b>{c.name}</b>
                  {c.blurb && <span className="tiny muted">{c.blurb}</span>}
                  {equipped ? (
                    <span className="tag honey">Equipped</span>
                  ) : owned ? (
                    <button className="btn secondary small" onClick={() => equip(c.id)}>
                      Equip
                    </button>
                  ) : (
                    <button
                      className="btn small"
                      disabled={chips < c.price}
                      onClick={() => {
                        if (buy(c.id)) {
                          sfx.chip();
                          celebrate(0.6);
                        }
                      }}
                    >
                      🪙 {c.price}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
