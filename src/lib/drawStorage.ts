import type { AthleteRecord, CategoryInfo } from '../types';
import type { BracketData } from './drawAlgorithm';
import { categoryLabel } from './normalize';

/**
 * The draw (imported roster + drawn/edited brackets), mirrored to localStorage.
 * The draw screen owns the writes; the control screen reads it to know who
 * fights in which bout.
 */
export const DRAW_STORAGE_KEY = 'karate-draw-state-v1';

export interface DrawState {
  allAthletes: AthleteRecord[];
  categories: CategoryInfo[];
  brackets: Record<string, BracketData>;
  fileName: string;
}

/**
 * Rebuild every display label from its class key.
 *
 * The label wording is presentation, but it was captured into the saved data at
 * draw time. Deriving it again on load means a wording change reaches draws that
 * are already saved — re-drawing them to pick up new text would reshuffle a draw
 * that may already have been printed and handed out.
 */
function relabel(state: Partial<DrawState>): Partial<DrawState> {
  const labelFor = (key: string) => {
    const [weight = '', ageGroup = '', gender = ''] = key.split('|');
    return categoryLabel(weight, ageGroup, gender);
  };
  return {
    ...state,
    categories: state.categories?.map((c) => ({ ...c, label: labelFor(c.key) })),
    brackets: state.brackets
      ? Object.fromEntries(
          Object.entries(state.brackets).map(([key, b]) => [
            key,
            { ...b, category: labelFor(key) },
          ])
        )
      : undefined,
  };
}

export function loadDraw(): Partial<DrawState> {
  try {
    const raw = localStorage.getItem(DRAW_STORAGE_KEY);
    return raw ? relabel(JSON.parse(raw) as Partial<DrawState>) : {};
  } catch {
    return {};
  }
}

export function saveDraw(state: DrawState): void {
  try {
    localStorage.setItem(DRAW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/** Weight classes that actually have a bracket drawn, in display order. */
export function drawnCategories(draw: Partial<DrawState>): CategoryInfo[] {
  const brackets = draw.brackets ?? {};
  return (draw.categories ?? []).filter((c) => brackets[c.key]);
}
