import { create } from 'zustand';
import type { Side, Competitor } from '../types';

const MATCH_SECONDS = 120; // default 2:00
export const MATCH_DURATIONS = [10, 15, 30, 60, 90, 120, 180] as const; // 0:10 / 0:15 / 0:30 / 1:00 / 1:30 / 2:00 / 3:00
const WIN_MARGIN = 8; // an 8-point lead ends the match
const FINAL_FOUL = 'H'; // reaching this foul hands the win to the opponent
// Penalty codes as shown on the kumite board, left→right for the AO side.
export const PENALTY_CODES = ['C1', 'C2', 'C3', 'HC', 'H'] as const;

export type WinReason =
  | 'points' // 8-point lead
  | 'fouls' // opponent reached H
  | 'time' // ahead when time ran out
  | 'senshu' // level, but held VR
  | 'technique' // level, no VR, won on scoring strikes
  | 'decision' // level throughout, settled by the referees' flags
  | null;

/** Award values a strike can be worth, richest first — the order they are compared in. */
export const AWARD_VALUES = [3, 2, 1] as const;

/** How long each board callout stays up, in seconds. */
export const DEFAULT_FOUL_NOTICE_SEC = 10;
export const DEFAULT_POINT_NOTICE_SEC = 3;

const other = (side: Side): Side => (side === 'ao' ? 'aka' : 'ao');

/** How many strikes of each value a side landed, richest first: [#3, #2, #1]. */
export function tallyStrikes(log: readonly number[]): number[] {
  return AWARD_VALUES.map((v) => log.filter((x) => x === v).length);
}

/**
 * Who won on scoring strikes, or null when the two are indistinguishable.
 *
 * Level scores with no senshu are settled by *how* the points were scored: the
 * side with more 3-point strikes takes it; equal on those, more 2s; then more
 * 1s. Identical all the way down is a genuine tie and goes to the flags.
 */
export function decideByStrikes(
  logAo: readonly number[],
  logAka: readonly number[]
): Side | null {
  const ao = tallyStrikes(logAo);
  const aka = tallyStrikes(logAka);
  for (let i = 0; i < ao.length; i++) {
    if (ao[i] !== aka[i]) return ao[i] > aka[i] ? 'ao' : 'aka';
  }
  return null;
}

/** Flags raised by the judges: how many for each side. */
export interface FlagVote {
  ao: number;
  aka: number;
}

export interface FoulNotice {
  side: Side;
  code: string;
}

export interface PointNotice {
  side: Side;
  n: number;
}

interface MatchState {
  ao: Competitor;
  aka: Competitor;
  scoreAo: number;
  scoreAka: number;
  senshu: Side | null; // green "VR" badge — awarded by hand, never automatic
  penalties: Record<Side, string[]>;
  warning: boolean; // center "warning" indicator
  seconds: number;
  running: boolean;
  // The bout has been under way at least once. Nothing can be awarded before it
  // — a match sitting at a full 1:30 has not happened yet. Cleared by either
  // reset, and by loading the next bout.
  started: boolean;
  endsAt: number | null; // epoch ms when the running clock hits 0 (null when paused)
  durationSec: number; // selected match length
  round: string; // top-centre label, e.g. "Trận vòng loại"
  tournament: string; // bottom-left label, e.g. "Giải các CLB thanh thiếu nhi"
  category: string; // bottom-right label, e.g. weight/age class
  winner: Side | null; // set when the match is decided
  winReason: WinReason;
  // Every strike awarded, in order — [3,3,2] etc. The totals alone cannot settle
  // a level match; the tie-break needs to know *how* the points were scored.
  pointLog: Record<Side, number[]>;
  needsDecision: boolean; // level to the end and unresolvable → the judges' flags
  flagVote: FlagVote | null; // what the judges raised
  foulNotice: FoulNotice | null; // transient "WARNING C1" callout
  foulNoticeUntil: number | null; // epoch ms it disappears (shared by both windows)
  foulNoticeSec: number; // how long the callout stays up
  pointNotice: PointNotice | null; // transient "Point 3" callout
  pointNoticeUntil: number | null;
  pointNoticeSec: number;

  addPoint: (side: Side, n: number) => void;
  setScore: (side: Side, val: number) => void;
  resetScores: () => void;
  toggleSenshu: (side: Side) => void;
  togglePenalty: (side: Side, code: string) => void;
  toggleWarning: () => void;
  clearWinner: () => void;
  setDuration: (sec: number) => void;
  setSeconds: (sec: number) => void;
  setFoulNoticeSec: (sec: number) => void;
  clearFoulNotice: () => void;
  setPointNoticeSec: (sec: number) => void;
  /** Record the flags the judges raised; a majority settles the match. */
  castFlagVote: (vote: FlagVote) => void;
  clearFlagVote: () => void;
  setRound: (round: string) => void;
  setTournament: (tournament: string) => void;
  tick: () => void;
  // Timer handlers — named after the previous project's controls.
  onStart: () => void;
  onPause: () => void;
  onResetTime: () => void;
  onResetAll: () => void;
  setCategory: (category: string) => void;
  setCompetitor: (side: Side, patch: Partial<Competitor>) => void;
}

const initialCompetitor = (): Competitor => ({
  name: 'Nguyễn Thị Kim Ngân',
  unit: 'Phường DH',
  country: 'VIE',
});

export const useMatchStore = create<MatchState>((set) => ({
  ao: initialCompetitor(),
  aka: initialCompetitor(),
  scoreAo: 0,
  scoreAka: 0,
  senshu: null,
  penalties: { ao: [], aka: [] },
  warning: false,
  seconds: MATCH_SECONDS,
  running: false,
  started: false,
  endsAt: null,
  durationSec: MATCH_SECONDS,
  round: 'Trận vòng loại',
  tournament: 'Giải các CLB thanh thiếu nhi',
  category: 'lưới tuổi 6-9 hạng 36kg nam',
  winner: null,
  winReason: null,
  pointLog: { ao: [], aka: [] },
  needsDecision: false,
  flagVote: null,
  foulNotice: null,
  foulNoticeUntil: null,
  foulNoticeSec: DEFAULT_FOUL_NOTICE_SEC,
  pointNotice: null,
  pointNoticeUntil: null,
  pointNoticeSec: DEFAULT_POINT_NOTICE_SEC,

  addPoint: (side, n) =>
    set((s) => {
      if (s.winner) return {}; // match already decided
      // Awarded only once the bout is under way and the referee has stopped the
      // clock — never before the first CHẠY, never while the clock runs.
      if (!s.started || s.running) return {};
      const key = side === 'ao' ? 'scoreAo' : 'scoreAka';
      const next = Math.max(0, s[key] + n);
      const scoreAo = side === 'ao' ? next : s.scoreAo;
      const scoreAka = side === 'aka' ? next : s.scoreAka;
      // Senshu is the referee's call, never inferred from who scored first: the
      // operator awards it with the VR button.
      const patch: Partial<MatchState> = { [key]: next };

      // Keep the strike log in step with the score. A minus button undoes an
      // award, so it takes that value back off the log rather than logging a
      // negative. A clamped change (already at 0) touches neither.
      if (next !== s[key]) {
        const log = [...s.pointLog[side]];
        if (n > 0) {
          log.push(n);
        } else {
          const at = log.lastIndexOf(-n);
          if (at >= 0) log.splice(at, 1);
        }
        patch.pointLog = { ...s.pointLog, [side]: log };
      }

      // Announce the award itself, not corrections: only a real gain calls out.
      if (n > 0 && next > s[key]) {
        patch.pointNotice = { side, n };
        patch.pointNoticeUntil = Date.now() + s.pointNoticeSec * 1000;
      }
      // An 8-point lead wins immediately.
      if (Math.abs(scoreAo - scoreAka) >= WIN_MARGIN) {
        patch.winner = scoreAo > scoreAka ? 'ao' : 'aka';
        patch.winReason = 'points';
        patch.running = false;
        patch.endsAt = null;
      }
      return patch;
    }),

  setScore: (side, val) =>
    set((s) => {
      if (s.winner) return {};
      if (!s.started || s.running) return {};
      const key = side === 'ao' ? 'scoreAo' : 'scoreAka';
      const next = Math.max(0, val);
      const scoreAo = side === 'ao' ? next : s.scoreAo;
      const scoreAka = side === 'aka' ? next : s.scoreAka;
      const patch: Partial<MatchState> = { [key]: next };
      if (Math.abs(scoreAo - scoreAka) >= WIN_MARGIN) {
        patch.winner = scoreAo > scoreAka ? 'ao' : 'aka';
        patch.winReason = 'points';
        patch.running = false;
        patch.endsAt = null;
      }
      return patch;
    }),

  resetScores: () =>
    set({
      scoreAo: 0,
      scoreAka: 0,
      senshu: null,
      penalties: { ao: [], aka: [] },
      warning: false,
      winner: null,
      winReason: null,
      pointLog: { ao: [], aka: [] },
      needsDecision: false,
      flagVote: null,
      foulNotice: null,
      foulNoticeUntil: null,
      pointNotice: null,
      pointNoticeUntil: null,
    }),

  toggleSenshu: (side) =>
    set((s) => {
      if (s.winner) return {};
      // VR is gated like points: the bout must be under way and the clock
      // stopped. On top of that it needs a score on the board — senshu is a
      // first-point advantage, so it is meaningless at 0-0 and a press there is
      // almost certainly a slip.
      if (!s.started || s.running) return {};
      if (s.scoreAo + s.scoreAka === 0) return {};
      // Only one side can hold VR at a time.
      if (s.senshu && s.senshu !== side) return {};
      return { senshu: s.senshu === side ? null : side };
    }),

  togglePenalty: (side, code) =>
    set((s) => {
      if (s.winner) return {};
      // Fouls follow the same rule as points: bout under way, clock stopped.
      if (!s.started || s.running) return {};
      const current = s.penalties[side];
      const adding = !current.includes(code);
      const next = adding
        ? [...current, code]
        : current.filter((c) => c !== code);
      const patch: Partial<MatchState> = {
        penalties: { ...s.penalties, [side]: next },
      };
      // Announce the foul just called; it clears itself after foulNoticeSec.
      if (adding) {
        patch.foulNotice = { side, code };
        patch.foulNoticeUntil = Date.now() + s.foulNoticeSec * 1000;
      } else if (s.foulNotice?.side === side && s.foulNotice?.code === code) {
        patch.foulNotice = null;
        patch.foulNoticeUntil = null;
      }
      // A HC penalty forfeits that competitor's own VR advantage.
      if (adding && code === 'HC' && s.senshu === side) {
        patch.senshu = null;
      }
      // Reaching the final foul hands the win to the opponent.
      if (next.includes(FINAL_FOUL)) {
        patch.winner = other(side);
        patch.winReason = 'fouls';
        patch.running = false;
        patch.endsAt = null;
      }
      return patch;
    }),

  setFoulNoticeSec: (sec) =>
    set({ foulNoticeSec: Math.min(60, Math.max(1, Math.round(sec))) }),

  clearFoulNotice: () => set({ foulNotice: null, foulNoticeUntil: null }),

  setPointNoticeSec: (sec) =>
    set({ pointNoticeSec: Math.min(30, Math.max(1, Math.round(sec))) }),

  // A majority of flags settles it. An even split decides nothing — the head
  // referee then joins, and the vote is cast again as 3-2.
  castFlagVote: (vote) =>
    set(() => {
      if (vote.ao === vote.aka) {
        return { flagVote: vote, needsDecision: true, winner: null, winReason: null };
      }
      return {
        flagVote: vote,
        needsDecision: false,
        winner: vote.ao > vote.aka ? 'ao' : 'aka',
        winReason: 'decision' as WinReason,
      };
    }),

  clearFlagVote: () => set({ flagVote: null, winner: null, winReason: null, needsDecision: true }),

  toggleWarning: () => set((s) => ({ warning: !s.warning })),

  clearWinner: () => set({ winner: null, winReason: null }),

  setDuration: (sec) =>
    set((s) => ({
      durationSec: sec,
      seconds: s.running ? s.seconds : sec,
      endsAt: s.running ? s.endsAt : null,
    })),

  setSeconds: (sec) =>
    set({
      seconds: Math.max(0, sec),
      running: false,
      endsAt: null,
      winner: null,
      winReason: null,
      needsDecision: false,
      flagVote: null,
    }),

  // Recompute the remaining seconds from the absolute deadline. Driven by a
  // single window's interval; the value is broadcast to the display window.
  tick: () =>
    set((s) => {
      if (!s.running || s.endsAt == null) return {};
      const remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        // Time up. Ahead on points wins outright; level goes down the tie-break:
        // senshu first, then the scoring strikes, and only a dead heat on both
        // reaches the judges' flags.
        let winner: Side | null = null;
        let winReason: WinReason = null;
        let needsDecision = false;
        if (s.scoreAo !== s.scoreAka) {
          winner = s.scoreAo > s.scoreAka ? 'ao' : 'aka';
          winReason = 'time';
        } else if (s.senshu) {
          winner = s.senshu;
          winReason = 'senshu';
        } else {
          const byStrikes = decideByStrikes(s.pointLog.ao, s.pointLog.aka);
          if (byStrikes) {
            winner = byStrikes;
            winReason = 'technique';
          } else {
            needsDecision = true;
          }
        }
        return { seconds: 0, running: false, endsAt: null, winner, winReason, needsDecision };
      }
      return { seconds: remaining };
    }),

  onStart: () =>
    set((s) =>
      s.seconds > 0
        ? { running: true, started: true, endsAt: Date.now() + s.seconds * 1000 }
        : {}
    ),
  onPause: () =>
    set((s) => {
      const remaining =
        s.endsAt != null
          ? Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000))
          : s.seconds;
      return { running: false, endsAt: null, seconds: remaining };
    }),
  // Both resets put the clock back to the top, which means the bout is once
  // again waiting to be started — and so is closed to scoring.
  onResetTime: () =>
    set((s) => ({
      seconds: s.durationSec,
      running: false,
      started: false,
      endsAt: null,
      winner: null,
      winReason: null,
      needsDecision: false,
      flagVote: null,
    })),
  onResetAll: () =>
    set((s) => ({
      seconds: s.durationSec,
      running: false,
      started: false,
      endsAt: null,
      scoreAo: 0,
      scoreAka: 0,
      senshu: null,
      penalties: { ao: [], aka: [] },
      warning: false,
      winner: null,
      winReason: null,
      pointLog: { ao: [], aka: [] },
      needsDecision: false,
      flagVote: null,
      foulNotice: null,
      foulNoticeUntil: null,
      pointNotice: null,
      pointNoticeUntil: null,
    })),
  setCategory: (category) => set({ category }),
  setRound: (round) => set({ round }),
  setTournament: (tournament) => set({ tournament }),
  setCompetitor: (side, patch) =>
    set((s) => ({ [side]: { ...s[side], ...patch } } as Partial<MatchState>)),
}));

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
