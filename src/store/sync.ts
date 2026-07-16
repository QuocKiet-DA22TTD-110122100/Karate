import type { StoreApi, UseBoundStore } from 'zustand';
import { useMatchStore } from './matchStore';
import { useKataStore } from './kataStore';

// Realtime sync between the control window and the display window.
// BroadcastChannel drives live updates (same browser, e.g. one PC + a projector
// window); localStorage hydrates a window when it opens.

interface SyncOptions<T> {
  channel: string;
  storageKey: string;
  /** The serialisable slice to sync (state minus action functions). */
  pick: (state: T) => Partial<T>;
}

function createStoreSync<T>(
  store: UseBoundStore<StoreApi<T>>,
  { channel, storageKey, pick }: SyncOptions<T>
): void {
  if (typeof window === 'undefined') return;

  const bc =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(channel) : null;

  // Guards against echoing a remotely-applied change back onto the wire.
  let applyingRemote = false;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      applyingRemote = true;
      store.setState(JSON.parse(saved) as Partial<T>);
      applyingRemote = false;
    }
  } catch {
    /* ignore malformed storage */
  }

  store.subscribe((state) => {
    if (applyingRemote) return;
    const snap = pick(state);
    try {
      localStorage.setItem(storageKey, JSON.stringify(snap));
    } catch {
      /* storage may be full/unavailable */
    }
    bc?.postMessage(snap);
  });

  if (bc) {
    bc.onmessage = (e: MessageEvent<Partial<T>>) => {
      applyingRemote = true;
      store.setState(e.data);
      applyingRemote = false;
    };
  }
}

let matchStarted = false;
export function initMatchSync(): void {
  if (matchStarted) return;
  matchStarted = true;
  createStoreSync(useMatchStore, {
    channel: 'karate-match',
    storageKey: 'karate-match-state',
    pick: (s) => ({
      ao: s.ao,
      aka: s.aka,
      scoreAo: s.scoreAo,
      scoreAka: s.scoreAka,
      senshu: s.senshu,
      penalties: s.penalties,
      warning: s.warning,
      seconds: s.seconds,
      running: s.running,
      started: s.started,
      endsAt: s.endsAt,
      durationSec: s.durationSec,
      round: s.round,
      tournament: s.tournament,
      category: s.category,
      winner: s.winner,
      winReason: s.winReason,
      pointLog: s.pointLog,
      needsDecision: s.needsDecision,
      flagVote: s.flagVote,
      foulNotice: s.foulNotice,
      foulNoticeUntil: s.foulNoticeUntil,
      foulNoticeSec: s.foulNoticeSec,
      pointNotice: s.pointNotice,
      pointNoticeUntil: s.pointNoticeUntil,
      pointNoticeSec: s.pointNoticeSec,
    }),
  });
}

let kataStarted = false;
export function initKataSync(): void {
  if (kataStarted) return;
  kataStarted = true;
  createStoreSync(useKataStore, {
    channel: 'karate-kata',
    storageKey: 'karate-kata-state',
    pick: (s) => ({
      ao: s.ao,
      aka: s.aka,
      kataAo: s.kataAo,
      kataAka: s.kataAka,
      round: s.round,
      tournament: s.tournament,
      category: s.category,
      phase: s.phase,
      durationSec: s.durationSec,
      seconds: s.seconds,
      running: s.running,
      endsAt: s.endsAt,
    }),
  });
}
