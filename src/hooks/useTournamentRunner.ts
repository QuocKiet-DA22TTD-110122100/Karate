import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CategoryInfo } from '../types';
import { computeBouts, nodeKey, type Bout } from '../lib/bouts';
import { loadDraw, drawnCategories, type DrawState } from '../lib/drawStorage';
import { useMatchStore } from '../store/matchStore';
import { useTournamentStore } from '../store/tournamentStore';

/** How far a weight class has got. */
export interface CategoryProgress {
  total: number;
  decided: number;
  done: boolean;
}

export interface Runner {
  /** Weight classes that have a bracket drawn. */
  categories: CategoryInfo[];
  /** Classes still to be fought — a finished class drops out of here. */
  waiting: CategoryInfo[];
  /** Classes whose every bout has a winner. */
  finished: CategoryInfo[];
  /** catKey → how many of its bouts are decided. */
  progress: Record<string, CategoryProgress>;
  activeCategory: CategoryInfo | null;
  /** Bouts of the active class, with winners filled in as they are decided. */
  bouts: Bout[];
  activeBout: Bout | null;
  /** True once every bout of every drawn class has a winner. */
  allDone: boolean;
  loadBout: (catKey: string, boutNo: number) => void;
  /** Load a class's first bout that has no winner yet. */
  loadCategory: (catKey: string) => void;
  /** Jump straight to the next undecided bout, skipping the celebration wait. */
  advanceNow: () => void;
  hasDraw: boolean;
}

/**
 * Drives the match order from the draw: loads each bout's competitors onto the
 * board, records the winner when the match is decided, then moves on — through
 * the class, then to the next class.
 *
 * `drive` must be true in exactly one window (the control panel). The projected
 * board mirrors the same store, so letting it run too would double-record.
 */
export function useTournamentRunner(drive: boolean): Runner {
  // Read once per mount: the operator draws, then navigates here, which remounts.
  const [draw] = useState<Partial<DrawState>>(() => loadDraw());
  const categories = useMemo(() => drawnCategories(draw), [draw]);

  const activeKey = useTournamentStore((s) => s.activeKey);
  const activeBoutNo = useTournamentStore((s) => s.activeBoutNo);
  const results = useTournamentStore((s) => s.results);
  const useDraw = useTournamentStore((s) => s.useDraw);
  const autoAdvanceSec = useTournamentStore((s) => s.autoAdvanceSec);
  const setActive = useTournamentStore((s) => s.setActive);
  const recordWinner = useTournamentStore((s) => s.recordWinner);

  const winner = useMatchStore((s) => s.winner);

  const activeCategory = categories.find((c) => c.key === activeKey) ?? null;
  const bracket = activeKey ? draw.brackets?.[activeKey] ?? null : null;
  const bouts = useMemo(
    () => (bracket ? computeBouts(bracket, results[activeKey] ?? {}) : []),
    [bracket, results, activeKey]
  );
  const activeBout = bouts.find((b) => b.no === activeBoutNo) ?? null;

  const progress = useMemo(() => {
    const m: Record<string, CategoryProgress> = {};
    for (const c of categories) {
      const br = draw.brackets?.[c.key];
      if (!br) continue;
      const list = computeBouts(br, results[c.key] ?? {});
      const decided = list.filter((b) => b.winner).length;
      m[c.key] = {
        total: list.length,
        decided,
        done: list.length > 0 && decided === list.length,
      };
    }
    return m;
  }, [categories, draw, results]);

  const waiting = useMemo(
    () => categories.filter((c) => !progress[c.key]?.done),
    [categories, progress]
  );
  const finished = useMemo(
    () => categories.filter((c) => progress[c.key]?.done),
    [categories, progress]
  );
  const allDone = categories.length > 0 && waiting.length === 0;

  const loadBout = useCallback(
    (catKey: string, boutNo: number) => {
      const br = draw.brackets?.[catKey];
      if (!br) return;
      // Read results fresh: a win may have been recorded moments ago.
      const list = computeBouts(br, useTournamentStore.getState().results[catKey] ?? {});
      const b = list.find((x) => x.no === boutNo);
      if (!b) return;

      const m = useMatchStore.getState();
      m.onResetAll();
      m.setCompetitor('aka', { name: b.aka?.name ?? '', unit: b.aka?.unit ?? '' });
      m.setCompetitor('ao', { name: b.ao?.name ?? '', unit: b.ao?.unit ?? '' });
      m.setRound(b.label);
      const cat = categories.find((c) => c.key === catKey);
      if (cat) m.setCategory(cat.label);
      setActive(catKey, boutNo);
    },
    [draw, categories, setActive]
  );

  /** Pick up a class where it left off, not back at bout 1. */
  const loadCategory = useCallback(
    (catKey: string) => {
      const br = draw.brackets?.[catKey];
      if (!br) return;
      const list = computeBouts(br, useTournamentStore.getState().results[catKey] ?? {});
      const next = list.find((b) => !b.winner) ?? list[0];
      if (next) loadBout(catKey, next.no);
    },
    [draw, loadBout]
  );

  /** First undecided bout, searching the current class then the ones after it. */
  const advanceNow = useCallback(() => {
    const state = useTournamentStore.getState();
    const from = Math.max(
      0,
      categories.findIndex((c) => c.key === state.activeKey)
    );
    for (let k = 0; k < categories.length; k++) {
      const cat = categories[(from + k) % categories.length];
      const br = draw.brackets?.[cat.key];
      if (!br) continue;
      const list = computeBouts(br, state.results[cat.key] ?? {});
      const next = list.find((b) => !b.winner);
      if (next) {
        loadBout(cat.key, next.no);
        return;
      }
    }
    setActive(state.activeKey, null); // nothing left to run
  }, [categories, draw, loadBout, setActive]);

  // Record the winner of the bout on the mat, exactly once.
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (!drive || !useDraw || !winner || !activeBout || !activeKey) return;
    const stamp = `${activeKey}:${activeBout.no}`;
    if (recorded.current === stamp) return;
    const champ = winner === 'aka' ? activeBout.aka : activeBout.ao;
    if (!champ) return;
    recorded.current = stamp;
    recordWinner(activeKey, nodeKey(activeBout.level, activeBout.index), champ);
  }, [drive, useDraw, winner, activeBout, activeKey, recordWinner]);

  // Celebrate the winner, then load whatever comes next.
  useEffect(() => {
    if (!drive || !useDraw || !winner || !activeBout) return;
    const t = setTimeout(advanceNow, autoAdvanceSec * 1000);
    return () => clearTimeout(t);
  }, [drive, useDraw, winner, activeBout, autoAdvanceSec, advanceNow]);

  return {
    categories,
    waiting,
    finished,
    progress,
    activeCategory,
    bouts,
    activeBout,
    allDone,
    loadBout,
    loadCategory,
    advanceNow,
    hasDraw: categories.length > 0,
  };
}
