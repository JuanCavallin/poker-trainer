import { useEffect, useRef } from 'react';
import { useStore, useToasts } from '../../state/store';

export function celebrate(power = 1) {
  if (useStore.getState().settings.reducedMotion) return;
  window.dispatchEvent(new CustomEvent('den-confetti', { detail: power }));
}

const COLORS = ['#eaa53f', '#d9734e', '#7fae8a', '#6f9fc9', '#b5527c', '#f2c14e'];

export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    let parts: { x: number; y: number; vx: number; vy: number; r: number; c: string; rot: number; vr: number; life: number }[] = [];
    const tick = () => {
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext('2d')!;
      g.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.life > 0 && p.y < cv.height + 20);
      for (const p of parts) {
        p.vy += 0.25;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 1;
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.globalAlpha = Math.min(1, p.life / 40);
        g.fillStyle = p.c;
        g.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        g.restore();
      }
      if (parts.length) raf = requestAnimationFrame(tick);
    };
    const fire = (e: Event) => {
      const cv = ref.current;
      if (!cv) return;
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const power = (e as CustomEvent<number>).detail ?? 1;
      const n = Math.round(90 * power);
      for (let i = 0; i < n; i++) {
        const fromLeft = i % 2 === 0;
        parts.push({
          x: fromLeft ? cv.width * 0.25 : cv.width * 0.75,
          y: cv.height * 0.35,
          vx: (Math.random() - 0.5) * 14 + (fromLeft ? -1 : 1),
          vy: -Math.random() * 12 - 4,
          r: 3 + Math.random() * 4,
          c: COLORS[i % COLORS.length],
          rot: Math.random() * 6,
          vr: (Math.random() - 0.5) * 0.4,
          life: 110 + Math.random() * 50,
        });
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('den-confetti', fire);
    return () => {
      window.removeEventListener('den-confetti', fire);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <canvas ref={ref} className="confetti" />;
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ''}`} onClick={() => dismiss(t.id)}>
          <span className="e">{t.emoji}</span>
          <div>
            <b>{t.title}</b>
            {t.body && <div className="small">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Modal({ onClose, children, wide }: { onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={wide ? { maxWidth: 820 } : undefined} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
