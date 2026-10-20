import { useStore } from '../state/store';

/** Tiny synthesized sound effects: no assets, quiet by design. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!useStore.getState().settings.sound) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, gain: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 2.5;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  paint: () => noise(0.04, 2600, 0.05),
  chip: () => {
    noise(0.05, 3800, 0.12);
    noise(0.04, 5200, 0.08, 0.05);
  },
  flip: () => noise(0.09, 1800, 0.12),
  good: () => {
    tone(660, 0.18, 'sine', 0.08);
    tone(880, 0.25, 'sine', 0.07, 0.09);
  },
  great: () => {
    tone(523, 0.16, 'triangle', 0.08);
    tone(659, 0.16, 'triangle', 0.08, 0.08);
    tone(784, 0.3, 'triangle', 0.08, 0.16);
  },
  meh: () => tone(392, 0.25, 'sine', 0.06),
  bad: () => {
    tone(330, 0.2, 'sine', 0.06);
    tone(262, 0.3, 'sine', 0.06, 0.12);
  },
  level: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 'triangle', 0.07, i * 0.1)),
  tick: () => tone(1200, 0.03, 'square', 0.02),
};
