// Small WebAudio helper — synthesises the warning/end beeps so we don't ship
// audio files. Browsers block audio until a user gesture, so initAudioUnlock()
// resumes the context on the first click/keypress in each window.

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

export function initAudioUnlock(): void {
  if (typeof window === 'undefined') return;
  const resume = () => {
    getCtx()?.resume();
    window.removeEventListener('pointerdown', resume);
    window.removeEventListener('keydown', resume);
  };
  window.addEventListener('pointerdown', resume);
  window.addEventListener('keydown', resume);
}

function beep(
  freq: number,
  durationMs: number,
  when = 0,
  type: OscillatorType = 'sine',
  gainVal = 0.2
): void {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = gainVal;
  osc.connect(gain);
  gain.connect(c.destination);
  const t = c.currentTime + when;
  osc.start(t);
  osc.stop(t + durationMs / 1000);
}

/** Play the bell sound for 2 seconds — "time almost up" (fires at 0:15). */
let _bell: HTMLAudioElement | null = null;
export function playWarning(): void {
  if (!_bell) {
    _bell = new Audio(new URL('/tieng-chuong-het-gio.mp3', import.meta.env.BASE_URL).href);
  }
  _bell.currentTime = 0;
  _bell.play().catch(() => {});
}

/** One long low buzz — "match over" (fires at 0:00). */
export function playEnd(): void {
  beep(392, 700, 0, 'square', 0.25);
}
