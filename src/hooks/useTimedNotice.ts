import { useEffect, useState } from 'react';
import { useMatchStore, type FoulNotice, type PointNotice } from '../store/matchStore';

/**
 * A board callout, or null once its deadline has passed.
 *
 * Expiry is an absolute deadline held in the store rather than a local timer, so
 * the control window and the projected board drop the callout at the same moment
 * even if one of them opened midway through.
 */
function useTimedNotice<T>(notice: T | null, until: number | null): T | null {
  const [, bump] = useState(0);

  useEffect(() => {
    if (until == null) return;
    const ms = until - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(() => bump((n) => n + 1), ms);
    return () => clearTimeout(t);
  }, [until]);

  if (!notice || until == null || Date.now() >= until) return null;
  return notice;
}

/** The "WARNING C1" callout, while it is still due on screen. */
export function useFoulNotice(): FoulNotice | null {
  const notice = useMatchStore((s) => s.foulNotice);
  const until = useMatchStore((s) => s.foulNoticeUntil);
  return useTimedNotice(notice, until);
}

/** The "Point 3" callout, while it is still due on screen. */
export function usePointNotice(): PointNotice | null {
  const notice = useMatchStore((s) => s.pointNotice);
  const until = useMatchStore((s) => s.pointNoticeUntil);
  return useTimedNotice(notice, until);
}
