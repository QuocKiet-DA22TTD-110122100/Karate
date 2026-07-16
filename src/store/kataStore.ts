import { create } from 'zustand';
import type { Side, Competitor } from '../types';

// Kata is timed, not scored: a 30s preparation window (enter / bow / announce),
// then the operator starts the performance clock (1:30 / 2:00 / 3:00).
export const KATA_DURATIONS = [90, 120, 180] as const; // seconds
export const KATA_OPTIONS = [
  'KATA',
  'Heian Shodan',
  'Heian Nidan',
  'Bassai Dai',
  'Kanku Dai',
];
const PREPARE_SECONDS = 30;
const DEFAULT_DURATION = 120;

export type KataPhase = 'prepare' | 'perform';

interface KataState {
  ao: Competitor;
  aka: Competitor;
  kataAo: string;
  kataAka: string;
  round: string; // top-centre label
  tournament: string; // bottom-left label
  category: string; // bottom-right label
  phase: KataPhase;
  durationSec: number; // chosen performance length
  seconds: number;
  running: boolean;
  endsAt: number | null;

  setCompetitor: (side: Side, patch: Partial<Competitor>) => void;
  setKata: (side: Side, value: string) => void;
  setCategory: (category: string) => void;
  setRound: (round: string) => void;
  setTournament: (tournament: string) => void;
  setDuration: (sec: number) => void;
  setSeconds: (sec: number) => void;
  startPerform: () => void; // operator press: switch to the performance clock
  backToPrepare: () => void;
  onStart: () => void;
  onPause: () => void;
  onResetTime: () => void;
  tick: () => void;
}

const initialCompetitor = (): Competitor => ({
  name: 'Nguyễn Thị Kim Ngân',
  unit: 'Phường DH',
  country: 'VIE',
});

export const useKataStore = create<KataState>((set) => ({
  ao: initialCompetitor(),
  aka: initialCompetitor(),
  kataAo: 'KATA',
  kataAka: 'KATA',
  round: 'Trận vòng loại',
  tournament: 'Giải các CLB thanh thiếu nhi',
  category: 'lưới tuổi 6-9 KATA',
  phase: 'prepare',
  durationSec: DEFAULT_DURATION,
  seconds: PREPARE_SECONDS,
  running: false,
  endsAt: null,

  setCompetitor: (side, patch) =>
    set((s) => ({ [side]: { ...s[side], ...patch } } as Partial<KataState>)),
  setKata: (side, value) =>
    set(side === 'ao' ? { kataAo: value } : { kataAka: value }),
  setCategory: (category) => set({ category }),
  setRound: (round) => set({ round }),
  setTournament: (tournament) => set({ tournament }),

  setDuration: (sec) =>
    set((s) => ({
      durationSec: sec,
      seconds: s.phase === 'perform' && !s.running ? sec : s.seconds,
      endsAt: s.phase === 'perform' && !s.running ? null : s.endsAt,
    })),

  setSeconds: (sec) =>
    set({
      seconds: Math.max(0, sec),
      running: false,
      endsAt: null,
    }),

  // Operator press after the athlete has entered: start timing the kata.
  startPerform: () =>
    set((s) => ({
      phase: 'perform',
      seconds: s.durationSec,
      running: true,
      endsAt: Date.now() + s.durationSec * 1000,
    })),

  backToPrepare: () =>
    set({ phase: 'prepare', seconds: PREPARE_SECONDS, running: false, endsAt: null }),

  onStart: () =>
    set((s) =>
      s.seconds > 0
        ? { running: true, endsAt: Date.now() + s.seconds * 1000 }
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
  onResetTime: () =>
    set((s) => ({
      seconds: s.phase === 'prepare' ? PREPARE_SECONDS : s.durationSec,
      running: false,
      endsAt: null,
    })),

  tick: () =>
    set((s) => {
      if (!s.running || s.endsAt == null) return {};
      const remaining = Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));
      if (remaining <= 0) return { seconds: 0, running: false, endsAt: null };
      return { seconds: remaining };
    }),
}));
