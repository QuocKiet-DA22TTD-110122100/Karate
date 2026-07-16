import { create } from 'zustand';
import type { RosterEntry } from '../types';
import type { BoutResults } from '../lib/bouts';

/**
 * Which bout of which weight class is on the mat, and who has won what so far.
 *
 * Kept apart from the draw itself: the draw screen owns the brackets, this owns
 * the results of running them. Recorded winners feed back through
 * `computeBouts`, which is what fills in later bouts ("winner of trận 1").
 */
const RUN_STORAGE_KEY = 'karate-run-state-v1';

export const DEFAULT_ADVANCE_SEC = 8;

interface RunState {
  /** Category key of the class on the mat, '' when nothing is loaded. */
  activeKey: string;
  /** Bout number within that class, null when nothing is loaded. */
  activeBoutNo: number | null;
  /** catKey → nodeKey → winner. */
  results: Record<string, BoutResults>;
  /** Pull competitors from the draw instead of typing them by hand. */
  useDraw: boolean;
  /** Seconds the winner is celebrated before the next bout loads. */
  autoAdvanceSec: number;

  setActive: (key: string, boutNo: number | null) => void;
  setUseDraw: (on: boolean) => void;
  setAutoAdvanceSec: (sec: number) => void;
  recordWinner: (catKey: string, node: string, athlete: RosterEntry) => void;
  clearResults: (catKey?: string) => void;
}

interface Persisted {
  activeKey: string;
  activeBoutNo: number | null;
  results: Record<string, BoutResults>;
  useDraw: boolean;
  autoAdvanceSec: number;
}

function load(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(RUN_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Persisted>) : {};
  } catch {
    return {};
  }
}

function save(s: RunState): void {
  try {
    localStorage.setItem(
      RUN_STORAGE_KEY,
      JSON.stringify({
        activeKey: s.activeKey,
        activeBoutNo: s.activeBoutNo,
        results: s.results,
        useDraw: s.useDraw,
        autoAdvanceSec: s.autoAdvanceSec,
      })
    );
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

const saved = load();

export const useTournamentStore = create<RunState>((set) => ({
  activeKey: saved.activeKey ?? '',
  activeBoutNo: saved.activeBoutNo ?? null,
  results: saved.results ?? {},
  useDraw: saved.useDraw ?? true,
  autoAdvanceSec: saved.autoAdvanceSec ?? DEFAULT_ADVANCE_SEC,

  setActive: (activeKey, activeBoutNo) => set({ activeKey, activeBoutNo }),
  setUseDraw: (useDraw) => set({ useDraw }),
  setAutoAdvanceSec: (sec) =>
    set({ autoAdvanceSec: Math.min(60, Math.max(0, Math.round(sec))) }),

  recordWinner: (catKey, node, athlete) =>
    set((s) => ({
      results: { ...s.results, [catKey]: { ...(s.results[catKey] ?? {}), [node]: athlete } },
    })),

  clearResults: (catKey) =>
    set((s) => {
      if (!catKey) return { results: {} };
      const { [catKey]: _dropped, ...rest } = s.results;
      return { results: rest };
    }),
}));

useTournamentStore.subscribe(save);
