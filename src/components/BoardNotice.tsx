import type { ReactNode } from 'react';
import type { Side } from '../types';
import { useFoulNotice, usePointNotice } from '../hooks/useTimedNotice';

/**
 * The full-board callout from the Figma: a slab in the side's colour covering
 * the middle of the board, with the announcement in huge white type.
 *
 * Sizes track the viewport rather than fixed pixels — the design is drawn at
 * 1728×1117 but the board is projected at whatever the hall's screen is. The
 * font is capped against both axes so it cannot outgrow a narrow window.
 */
function Slab({ side, children }: Readonly<{ side: Side; children: ReactNode }>) {
  return (
    <div className="pointer-events-none absolute inset-0 z-50 grid place-items-center">
      <div
        className={`grid place-items-center ${side === 'ao' ? 'bg-ao' : 'bg-aka'}`}
        style={{ width: '65%', height: '60%' }}
      >
        <p
          className="text-center font-normal leading-none text-white"
          style={{ fontSize: 'min(14vw, 22vh)' }}
        >
          {children}
        </p>
      </div>
    </div>
  );
}

/** "Point 3" — shown as each point is awarded. */
export function PointNoticeOverlay() {
  const notice = usePointNotice();
  if (!notice) return null;
  return <Slab side={notice.side}>Point {notice.n}</Slab>;
}

/** "WARNING C1" — shown as each foul is called. */
export function FoulNoticeOverlay() {
  const notice = useFoulNotice();
  if (!notice) return null;
  return (
    <Slab side={notice.side}>
      WARNING
      <br />
      {notice.code}
    </Slab>
  );
}
