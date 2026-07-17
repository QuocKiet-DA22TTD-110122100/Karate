import { useEffect, useRef } from 'react';
import { useMatchStore } from '../store/matchStore';
import { playWarning, playEnd } from '../lib/sound';

const WARNING_AT = 15; // seconds left when the "almost up" alert fires

export interface MatchAlerts {
  /** Blink the board yellow: clock running and inside the final 15s. */
  warningPhase: boolean;
}

// Watches the (synced) clock and plays the warning beep at 0:15 and the end
// buzz at 0:00. Runs in whichever window mounts it — control and/or display.
export function useMatchAlerts(): MatchAlerts {
  const seconds = useMatchStore((s) => s.seconds);
  const running = useMatchStore((s) => s.running);
  const winner = useMatchStore((s) => s.winner);
  const prev = useRef(seconds);
  const prevRunning = useRef(running);

  useEffect(() => {
    const before = prev.current;
    const wasRunning = prevRunning.current;
    prev.current = seconds;
    prevRunning.current = running;
    // Sound only for a live clock. The final tick flips running off in the same
    // update it reaches 0, so "was running" must count too — but hand-editing
    // the time or picking a short duration while stopped stays silent.
    if (!running && !wasRunning) return;
    if (before > WARNING_AT && seconds <= WARNING_AT && seconds > 0) {
      playWarning();
    }
    if (before > 0 && seconds === 0) {
      playEnd();
    }
  }, [seconds, running]);

  return {
    warningPhase: running && !winner && seconds > 0 && seconds <= WARNING_AT,
  };
}
