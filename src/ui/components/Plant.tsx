/** Procedural pot plant: stage 0 seed … 4 golden bloom; health < 1 makes it droop and yellow. */
export function Plant({ stage, health, hue, size = 96 }: { stage: number; health: number; hue: number; size?: number }) {
  const thirsty = stage > 0 && health < 0.75;
  const leaf = thirsty ? `hsl(${45 + health * 40}, 45%, 48%)` : `hsl(${115 + hue / 12}, 42%, ${stage >= 4 ? 44 : 40}%)`;
  const leafLight = thirsty ? `hsl(45, 50%, 62%)` : `hsl(${115 + hue / 12}, 45%, 56%)`;
  const droop = thirsty ? 18 * (1 - health) : 0;
  const stemH = [0, 14, 28, 38, 42][stage];
  const top = 82 - stemH;
  const petal = `hsl(${hue}, 70%, 66%)`;
  const petalDark = `hsl(${hue}, 60%, 52%)`;
  const leaves: { y: number; side: 1 | -1; s: number }[] = [];
  if (stage >= 1) leaves.push({ y: 80 - stemH * 0.55, side: -1, s: 0.8 }, { y: 80 - stemH * 0.7, side: 1, s: 0.75 });
  if (stage >= 2) leaves.push({ y: 80 - stemH * 0.25, side: 1, s: 1 }, { y: 80 - stemH * 0.4, side: -1, s: 1 });
  return (
    <svg className="plant-svg" viewBox="0 0 100 110" width={size} height={size * 1.08} aria-hidden>
      {stage >= 4 && (
        <circle cx={50} cy={top} r={26} fill="url(#glow)" opacity={0.9}>
          <animate attributeName="opacity" values="0.5;0.95;0.5" dur="3s" repeatCount="indefinite" />
        </circle>
      )}
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="#ffe08a" />
          <stop offset="100%" stopColor="#ffe08a" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g className={stage > 0 && !thirsty ? 'sway' : undefined}>
        {stage > 0 && <path d={`M50 84 C ${50 + droop / 2} ${84 - stemH / 2}, ${50 - 2} ${top + 6}, ${50 + droop} ${top}`} stroke={leaf} strokeWidth={3.2} fill="none" strokeLinecap="round" />}
        {leaves.map((l, i) => (
          <g key={i} transform={`translate(50 ${l.y}) rotate(${l.side * (-35 - droop * 1.6)}) scale(${l.s * l.side} ${l.s})`}>
            <path d="M0 0 C 6 -8, 18 -8, 22 0 C 18 6, 6 6, 0 0 Z" fill={leaf} />
            <path d="M2 0 C 8 -3, 14 -3, 20 0" stroke={leafLight} strokeWidth={1} fill="none" />
          </g>
        ))}
        {stage >= 3 && (
          <g transform={`translate(${50 + droop} ${top}) rotate(${droop * 2})`}>
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <ellipse key={a} cx={0} cy={-7} rx={5} ry={8} fill={petal} stroke={petalDark} strokeWidth={0.8} transform={`rotate(${a})`} />
            ))}
            <circle r={5} fill={stage >= 4 ? '#f2c14e' : '#f6d27a'} stroke="#d9a33a" strokeWidth={1} />
          </g>
        )}
        {stage === 2 && <circle cx={50 + droop} cy={top} r={4} fill={leafLight} />}
      </g>
      {stage >= 4 && (
        <g fill="#f2c14e">
          <path d="M20 30 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z">
            <animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite" />
          </path>
          <path d="M80 22 l1.5 4 l4 1.5 l-4 1.5 l-1.5 4 l-1.5 -4 l-4 -1.5 l4 -1.5 z">
            <animate attributeName="opacity" values="1;0;1" dur="2s" repeatCount="indefinite" />
          </path>
        </g>
      )}
      <path d="M28 84 L72 84 L66 106 L34 106 Z" fill="#d9734e" />
      <rect x={25} y={80} width={50} height={8} rx={3} fill="#e8875f" />
      <ellipse cx={50} cy={81} rx={21} ry={2.5} fill="#6b4029" />
      {stage === 0 && (
        <g>
          <ellipse cx={50} cy={77} rx={4.5} ry={3.2} fill="#a8703f" stroke="#7a4a26" strokeWidth={0.8} />
          <path d="M50 74 C 50 70, 53 68, 55 68" stroke="#7fae8a" strokeWidth={1.6} fill="none" strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
