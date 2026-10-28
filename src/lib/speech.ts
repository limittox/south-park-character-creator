export interface VoicePreset {
  id: string;
  label: string;
  pitch: number;
  rate: number;
}

export const VOICES: VoicePreset[] = [
  { id: 'kid', label: 'Little Kid', pitch: 1.9, rate: 1.05 },
  { id: 'grownup', label: 'Grown-Up', pitch: 0.9, rate: 0.95 },
  { id: 'chipmunk', label: 'Helium', pitch: 2, rate: 1.45 },
  { id: 'slow', label: 'Deep & Dramatic', pitch: 0.1, rate: 0.75 },
];

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => /en[-_]US/i.test(v.lang) && /google|natural|aria|jenny|guy/i.test(v.name)) ??
    voices.find((v) => /en[-_]US/i.test(v.lang)) ??
    voices.find((v) => /^en/i.test(v.lang))
  );
}

/** Speak text (if the browser can); always calls onEnd, even without speech support. */
export function speak(text: string, preset: VoicePreset, onEnd: () => void): () => void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd();
  };
  // Fallback timer: roughly how long a person would take to say it.
  const fallback = window.setTimeout(finish, Math.min(15000, 900 + text.length * (70 / preset.rate)));
  if (canSpeak()) {
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = preset.pitch;
      u.rate = preset.rate;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onend = () => {
        window.clearTimeout(fallback);
        finish();
      };
      u.onerror = () => {
        window.clearTimeout(fallback);
        finish();
      };
      window.speechSynthesis.speak(u);
    } catch {
      /* fall back to the timer */
    }
  }
  return () => {
    window.clearTimeout(fallback);
    if (canSpeak()) window.speechSynthesis.cancel();
    finish();
  };
}

/** Turn anything into hood-muffled speech. */
export function muffle(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const n = Math.max(1, Math.min(4, Math.round(w.length / 2)));
      const word = 'M' + 'm'.repeat(n) + (w.length > 3 ? 'ph' : 'f');
      return /[!?.]$/.test(w) ? word + w.slice(-1) : word;
    })
    .join(' ');
}
