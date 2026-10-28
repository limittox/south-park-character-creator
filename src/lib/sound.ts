import { getPref, setPref } from './storage';

let ac: AudioContext | null = null;
let muted: boolean = getPref('muted', false);

export const isMuted = () => muted;
export function setMuted(m: boolean) {
  muted = m;
  setPref('muted', m);
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ac.state === 'suspended') void ac.resume();
    return ac;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, slideTo?: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.2, filterFreq = 2000, sweepTo?: number) {
  const a = audio();
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(filterFreq, a.currentTime);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, a.currentTime + dur);
  const gain = a.createGain();
  gain.gain.setValueAtTime(vol, a.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur);
  src.connect(filter).connect(gain).connect(a.destination);
  src.start();
}

export const sfx = {
  pop: () => tone(420 + Math.random() * 160, 0.09, 'sine', 0.18, 900),
  click: () => tone(1200, 0.03, 'square', 0.04),
  whoosh: () => noise(0.35, 0.25, 400, 3000),
  shutter: () => {
    noise(0.06, 0.4, 3000);
    noise(0.12, 0.25, 1200);
    tone(2400, 0.02, 'square', 0.05, undefined, 0.08);
  },
  ding: () => {
    tone(880, 0.25, 'triangle', 0.15);
    tone(1320, 0.35, 'triangle', 0.12, undefined, 0.09);
  },
  boing: () => tone(180, 0.4, 'triangle', 0.2, 520),
  sad: () => {
    tone(392, 0.25, 'sawtooth', 0.06);
    tone(370, 0.25, 'sawtooth', 0.06, undefined, 0.25);
    tone(349, 0.25, 'sawtooth', 0.06, undefined, 0.5);
    tone(330, 0.6, 'sawtooth', 0.06, undefined, 0.75);
  },
  fart: () => {
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const dur = 0.5 + Math.random() * 0.5;
    const osc = a.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95 + Math.random() * 30, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + dur);
    const lfo = a.createOscillator();
    lfo.frequency.value = 18 + Math.random() * 14;
    const lfoGain = a.createGain();
    lfoGain.gain.value = 22;
    lfo.connect(lfoGain).connect(osc.frequency);
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(gain).connect(a.destination);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  },
};
