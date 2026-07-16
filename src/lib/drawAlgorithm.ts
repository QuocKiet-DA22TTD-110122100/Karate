import type { RosterEntry } from '../types';

export interface BracketSlot {
  athlete: RosterEntry | null;
  position: number; // 1-based
}

export interface BracketRound {
  label: string;
  matches: BracketMatch[];
}

export interface BracketMatch {
  id: string;
  label: string;
  left: RosterEntry | null;
  right: RosterEntry | null;
  winner: RosterEntry | null;
}

export interface BracketData {
  category: string;
  slots: BracketSlot[];
  rounds: BracketRound[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bracket size: ≤4 → 4 slots, ≤8 → 8 slots, otherwise next power of two.
function bracketSize(n: number): number {
  if (n <= 1) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  let s = 16;
  while (s < n) s *= 2;
  return s;
}

const branchOf = (slot: number, size: number): 0 | 1 => (slot < size / 2 ? 0 : 1);

/**
 * Order in which slots receive byes: the *right* slot of each match, alternating
 * upper/lower halves so byes spread evenly across branches (one per branch first).
 * Left slots come last (only reached when a match would otherwise be all-bye).
 */
function byeSlotOrder(size: number): number[] {
  const matches = size / 2;
  const half = matches / 2;
  const order: number[] = [];
  for (let i = 0; i < half; i++) {
    order.push(i * 2 + 1); // upper match i, right slot
    order.push((half + i) * 2 + 1); // lower match i, right slot
  }
  for (let i = 0; i < half; i++) {
    order.push(i * 2);
    order.push((half + i) * 2);
  }
  return order;
}

/**
 * Score how badly an assignment breaks the draw rules (0 = perfect):
 *  - same unit meeting in a first-round match          → very bad
 *  - a unit over-stacked in one branch (avoidable)     → bad
 *  - two same-unit athletes both advancing via a bye   → minor
 */
function scoreAssignment(slots: (RosterEntry | null)[], size: number): number {
  let score = 0;
  const matches = size / 2;

  // Same unit must not meet in round 1.
  for (let m = 0; m < matches; m++) {
    const a = slots[m * 2];
    const b = slots[m * 2 + 1];
    if (a && b && a.unit === b.unit) score += 1000;
  }

  // Same unit should be split across branches; a unit of k may have at most
  // ceil(k/2) in one branch (so 2 → 1+1, 3 → 2+1, 4 → 2+2).
  const byUnit = new Map<string, { up: number; low: number; total: number }>();
  slots.forEach((a, i) => {
    if (!a) return;
    const rec = byUnit.get(a.unit) ?? { up: 0, low: 0, total: 0 };
    if (branchOf(i, size) === 0) rec.up++;
    else rec.low++;
    rec.total++;
    byUnit.set(a.unit, rec);
  });
  for (const { up, low, total } of byUnit.values()) {
    const excess = Math.max(up, low) - Math.ceil(total / 2);
    if (excess > 0) score += 100 * excess;
  }

  // Spread byes across units: penalise two bye-advancing athletes of one unit.
  const byeAthletes: RosterEntry[] = [];
  for (let m = 0; m < matches; m++) {
    const a = slots[m * 2];
    const b = slots[m * 2 + 1];
    if (a && !b) byeAthletes.push(a);
    else if (!a && b) byeAthletes.push(b);
  }
  for (let i = 0; i < byeAthletes.length; i++) {
    for (let j = i + 1; j < byeAthletes.length; j++) {
      if (byeAthletes[i].unit === byeAthletes[j].unit) score += 10;
    }
  }

  return score;
}

/**
 * Place athletes into bracket slots honouring the draw rules. Uses randomised
 * search keeping the best assignment — for the small class sizes here it finds a
 * rule-perfect layout when one exists, and a best-effort one otherwise (e.g. a
 * single unit too large to fully separate).
 */
function assignToSlots(athletes: RosterEntry[]): BracketSlot[] {
  const size = bracketSize(athletes.length);
  const byes = size - athletes.length;
  const byeSlots = new Set(byeSlotOrder(size).slice(0, Math.max(0, byes)));
  const openSlots = [];
  for (let i = 0; i < size; i++) if (!byeSlots.has(i)) openSlots.push(i);

  let best: (RosterEntry | null)[] = new Array(size).fill(null);
  let bestScore = Infinity;

  for (let attempt = 0; attempt < 2000; attempt++) {
    const slotArr: (RosterEntry | null)[] = new Array(size).fill(null);
    const shuffledAthletes = shuffle(athletes);
    const slotsShuffled = shuffle(openSlots);
    shuffledAthletes.forEach((a, i) => {
      slotArr[slotsShuffled[i]] = a;
    });
    const sc = scoreAssignment(slotArr, size);
    if (sc < bestScore) {
      bestScore = sc;
      best = slotArr;
      if (sc === 0) break;
    }
  }

  return best.map((a, i) => ({ athlete: a, position: i + 1 }));
}

function makeMatch(
  id: string,
  label: string,
  left: RosterEntry | null = null,
  right: RosterEntry | null = null
): BracketMatch {
  return { id, label, left, right, winner: null };
}

export function generateBracket(
  athletes: RosterEntry[],
  category: string
): BracketData {
  return buildBracketFromSlots(assignToSlots(athletes), category);
}

/** Swap the two athletes at the given 1-based slot positions and rebuild. */
export function swapSlots(
  data: BracketData,
  posA: number,
  posB: number
): BracketData {
  const slots = data.slots.map((s) => ({ ...s }));
  const ia = slots.findIndex((s) => s.position === posA);
  const ib = slots.findIndex((s) => s.position === posB);
  if (ia === -1 || ib === -1) return data;
  const tmp = slots[ia].athlete;
  slots[ia].athlete = slots[ib].athlete;
  slots[ib].athlete = tmp;
  return buildBracketFromSlots(slots, data.category);
}

/**
 * Place an athlete dragged in from the roster at a 1-based slot position. The
 * athlete is *moved*, not copied: any other slot already holding the same person
 * is cleared first, so a drag can never duplicate someone into two branches.
 */
export function placeAthlete(
  data: BracketData,
  pos: number,
  athlete: RosterEntry
): BracketData {
  const identity = (a: RosterEntry) => `${a.name}|${a.unit}`.trim().toLowerCase();
  const target = identity(athlete);
  const slots = data.slots.map((s) => ({ ...s }));
  const i = slots.findIndex((s) => s.position === pos);
  if (i === -1) return data;
  for (const s of slots) {
    if (s.position !== pos && s.athlete && identity(s.athlete) === target) s.athlete = null;
  }
  slots[i].athlete = athlete;
  return buildBracketFromSlots(slots, data.category);
}

/** Set (or clear, with null) the athlete at a 1-based slot position. */
export function setSlotAthlete(
  data: BracketData,
  pos: number,
  athlete: RosterEntry | null
): BracketData {
  const slots = data.slots.map((s) => ({ ...s }));
  const i = slots.findIndex((s) => s.position === pos);
  if (i === -1) return data;
  slots[i].athlete = athlete;
  return buildBracketFromSlots(slots, data.category);
}

/** Build the rounds/matches from a fixed slot assignment (no randomisation). */
export function buildBracketFromSlots(
  slots: BracketSlot[],
  category: string
): BracketData {
  const size = slots.length;

  if (size === 4) {
    const matches = [
      makeMatch('m1', 'Trận 1', slots[0].athlete, slots[1].athlete),
      makeMatch('m2', 'Trận 2', slots[2].athlete, slots[3].athlete),
    ];
    const hasByes = matches.some((m) => !m.left || !m.right);
    const rounds: BracketRound[] = [
      { label: hasByes ? 'Vòng loại / Bán kết' : 'Bán kết', matches },
      { label: 'Chung kết', matches: [makeMatch('f1', 'Chung kết')] },
    ];
    return { category, slots, rounds };
  }

  if (size === 8) {
    const matches = [
      makeMatch('m1', 'Trận 1', slots[0].athlete, slots[1].athlete),
      makeMatch('m2', 'Trận 2', slots[2].athlete, slots[3].athlete),
      makeMatch('m3', 'Trận 3', slots[4].athlete, slots[5].athlete),
      makeMatch('m4', 'Trận 4', slots[6].athlete, slots[7].athlete),
    ];
    const hasByes = matches.some((m) => !m.left || !m.right);
    const rounds: BracketRound[] = [
      { label: hasByes ? 'Vòng loại / Tứ kết' : 'Tứ kết', matches },
      {
        label: 'Bán kết',
        matches: [
          makeMatch('s1', 'BK nhánh trên'),
          makeMatch('s2', 'BK nhánh dưới'),
        ],
      },
      { label: 'Chung kết', matches: [makeMatch('f1', 'Chung kết')] },
    ];
    return { category, slots, rounds };
  }

  // Generic bracket for larger draws (16, 32, …).
  const rounds: BracketRound[] = [];
  let count = size / 2;
  let roundIndex = 0;
  while (count >= 1) {
    const matches: BracketMatch[] = [];
    for (let i = 0; i < count; i++) {
      const label =
        count === 1 ? 'Chung kết' : `V${roundIndex + 1}-${i + 1}`;
      if (roundIndex === 0) {
        matches.push(
          makeMatch(`r0m${i}`, `Trận ${i + 1}`, slots[i * 2].athlete, slots[i * 2 + 1].athlete)
        );
      } else {
        matches.push(makeMatch(`r${roundIndex}m${i}`, label));
      }
    }
    const roundLabel =
      count === 1 ? 'Chung kết' : count === 2 ? 'Bán kết' : `Vòng ${roundIndex + 1}`;
    rounds.push({ label: roundLabel, matches });
    count = Math.floor(count / 2);
    roundIndex++;
  }
  return { category, slots, rounds };
}
