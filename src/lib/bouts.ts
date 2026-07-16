import type { BracketData } from './drawAlgorithm';
import type { RosterEntry } from '../types';

/**
 * The bouts of a bracket, in playing order.
 *
 * A bracket node is only a *bout* when two people actually meet there: a bye is
 * nobody fighting, so it is skipped and its athlete simply advances. Bout
 * numbers are assigned over real bouts only — round 0 top-to-bottom, then each
 * inner round in turn — which is the order they are called on the day.
 *
 * This is the single source of truth for numbering: the printed diagram and the
 * scoreboard both read it, so "trận 3" means the same bout in each.
 */

/** Winner of each decided bout, keyed by `${level}-${index}`. */
export type BoutResults = Record<string, RosterEntry>;

export const nodeKey = (level: number, index: number): string => `${level}-${index}`;

export interface Bout {
  no: number; // 1-based, in playing order
  level: number; // 0 = first round, `levels` = final
  index: number; // node index within the level
  label: string; // board caption: "Trận 3" / "Chung kết"
  isFinal: boolean;
  /** Upper feeder — red (aka). Null while the bout feeding it is undecided. */
  aka: RosterEntry | null;
  /** Lower feeder — blue (ao). */
  ao: RosterEntry | null;
  winner: RosterEntry | null;
}

interface Tree {
  round0: BracketData['rounds'][number]['matches'];
  levels: number;
  /** counts[l][j] = how many athletes sit in that node's subtree. */
  counts: number[][];
}

function buildTree(data: BracketData): Tree {
  const round0 = data.rounds[0]?.matches ?? [];
  const levels = Math.max(0, Math.round(Math.log2(round0.length || 1)));
  const counts: number[][] = [];
  counts[0] = round0.map((m) => (m.left ? 1 : 0) + (m.right ? 1 : 0));
  for (let l = 1; l <= levels; l++) {
    counts[l] = [];
    for (let j = 0; j < counts[l - 1].length / 2; j++) {
      counts[l][j] = counts[l - 1][2 * j] + counts[l - 1][2 * j + 1];
    }
  }
  return { round0, levels, counts };
}

/** True when two people meet at this node, i.e. both sides feeding it hold someone. */
function isBout(t: Tree, level: number, index: number): boolean {
  if (level === 0) {
    const m = t.round0[index];
    return !!m?.left && !!m?.right;
  }
  return t.counts[level - 1][2 * index] > 0 && t.counts[level - 1][2 * index + 1] > 0;
}

/** Who emerges from this node — by bye, by walkover, or by a recorded win. */
function resolve(
  t: Tree,
  level: number,
  index: number,
  results: BoutResults
): RosterEntry | null {
  if (t.counts[level][index] === 0) return null;
  if (level === 0) {
    const m = t.round0[index];
    if (m.left && m.right) return results[nodeKey(0, index)] ?? null;
    return m.left ?? m.right ?? null;
  }
  const upper = t.counts[level - 1][2 * index];
  const lower = t.counts[level - 1][2 * index + 1];
  // One side empty: whoever comes out of the other side advances unopposed.
  if (upper > 0 && lower === 0) return resolve(t, level - 1, 2 * index, results);
  if (lower > 0 && upper === 0) return resolve(t, level - 1, 2 * index + 1, results);
  return results[nodeKey(level, index)] ?? null;
}

export function computeBouts(data: BracketData, results: BoutResults = {}): Bout[] {
  const t = buildTree(data);
  const bouts: Bout[] = [];
  let no = 0;

  for (let level = 0; level <= t.levels; level++) {
    for (let index = 0; index < t.counts[level].length; index++) {
      if (!isBout(t, level, index)) continue;
      no++;
      const isFinal = level === t.levels;
      const aka =
        level === 0
          ? t.round0[index].left
          : resolve(t, level - 1, 2 * index, results);
      const ao =
        level === 0
          ? t.round0[index].right
          : resolve(t, level - 1, 2 * index + 1, results);
      bouts.push({
        no,
        level,
        index,
        label: isFinal ? 'Chung kết' : `Trận ${no}`,
        isFinal,
        aka,
        ao,
        winner: results[nodeKey(level, index)] ?? null,
      });
    }
  }
  return bouts;
}

/** The champion, once the final has been decided. */
export function champion(data: BracketData, results: BoutResults): RosterEntry | null {
  const t = buildTree(data);
  if (t.counts[t.levels]?.[0] === undefined) return null;
  return resolve(t, t.levels, 0, results);
}
