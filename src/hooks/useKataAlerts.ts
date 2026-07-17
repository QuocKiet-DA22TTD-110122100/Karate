import { useEffect, useRef } from 'react';
import { useKataStore } from '../store/kataStore';
import { playWarning, playEnd } from '../lib/sound';

const WARNING_AT = 15;

export interface KataAlerts {
  warningPhase: boolean; // blink the board in the final 15s of the performance
}

// Warning beep at 0:15 and end buzz at 0:00 — only while performing kata
// (the 30s preparation window counts down silently).
export function useKataAlerts(): KataAlerts {
  const seconds = useKataStore((s) => s.seconds);
  const running = useKataStore((s) => s.running);
  const phase = useKataStore((s) => s.phase);
  const prev = useRef(seconds);
  const prevRunning = useRef(running);

  useEffect(() => {
    const before = prev.current;
    const wasRunning = prevRunning.current;
    prev.current = seconds;
    prevRunning.current = running;
    if (phase !== 'perform') return;
    // Sound only for a live clock (the final tick stops it in the same update,
    // so "was running" counts too); hand-editing the time stays silent.
    if (!running && !wasRunning) return;
    if (before > WARNING_AT && seconds <= WARNING_AT && seconds > 0) {
      playWarning();
    }
    if (before > 0 && seconds === 0) {
      playEnd();
    }
  }, [seconds, phase, running]);

  return {
    warningPhase:
      phase === 'perform' && running && seconds > 0 && seconds <= WARNING_AT,
  };
}
