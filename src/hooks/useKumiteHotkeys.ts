import { useEffect } from 'react';
import type { Side } from '../types';
import { useMatchStore, PENALTY_CODES } from '../store/matchStore';

/**
 * Keyboard control for the kumite console.
 *
 * The keys mirror the screen: the left hand works AO on the left, the right hand
 * works AKA on the right, and each row runs outward-in exactly as the buttons do
 * (Q W E = +1 +2 +3 on the left; O I U = +1 +2 +3 on the right). That way the
 * operator can build the map from what they already see rather than memorising it.
 *
 * Points and fouls stay gated on a stopped clock — the store enforces that — so
 * the working rhythm is Space, then the award, then Space again.
 */
interface Binding {
  side: Side;
  n: number;
}

const POINT_ADD: Record<string, Binding> = {
  q: { side: 'ao', n: 1 },
  w: { side: 'ao', n: 2 },
  e: { side: 'ao', n: 3 },
  o: { side: 'aka', n: 1 },
  i: { side: 'aka', n: 2 },
  u: { side: 'aka', n: 3 },
};

const POINT_SUB: Record<string, Binding> = {
  a: { side: 'ao', n: 1 },
  s: { side: 'ao', n: 2 },
  d: { side: 'ao', n: 3 },
  l: { side: 'aka', n: 1 },
  k: { side: 'aka', n: 2 },
  j: { side: 'aka', n: 3 },
};

// Digits walk the penalty strip: 1-5 for AO, 6-0 for AKA.
const FOUL: Record<string, { side: Side; index: number }> = {
  '1': { side: 'ao', index: 0 },
  '2': { side: 'ao', index: 1 },
  '3': { side: 'ao', index: 2 },
  '4': { side: 'ao', index: 3 },
  '5': { side: 'ao', index: 4 },
  '6': { side: 'aka', index: 0 },
  '7': { side: 'aka', index: 1 },
  '8': { side: 'aka', index: 2 },
  '9': { side: 'aka', index: 3 },
  '0': { side: 'aka', index: 4 },
};

const SENSHU: Record<string, Side> = { z: 'ao', m: 'aka' };

/** True while focus sits somewhere that expects the keystroke itself. */
function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
  );
}

export function useKumiteHotkeys(onNextBout?: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

      const s = useMatchStore.getState();
      const key = e.key.toLowerCase();

      if (e.code === 'Space') {
        e.preventDefault();
        if (s.running) s.onPause();
        else s.onStart();
        return;
      }

      const add = POINT_ADD[key];
      if (add) {
        e.preventDefault();
        s.addPoint(add.side, add.n);
        return;
      }

      const sub = POINT_SUB[key];
      if (sub) {
        e.preventDefault();
        s.addPoint(sub.side, -sub.n);
        return;
      }

      const foul = FOUL[key];
      if (foul) {
        e.preventDefault();
        s.togglePenalty(foul.side, PENALTY_CODES[foul.index]);
        return;
      }

      const vr = SENSHU[key];
      if (vr) {
        e.preventDefault();
        s.toggleSenshu(vr);
        return;
      }

      if (key === 'n' && onNextBout) {
        e.preventDefault();
        onNextBout();
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onNextBout]);
}
