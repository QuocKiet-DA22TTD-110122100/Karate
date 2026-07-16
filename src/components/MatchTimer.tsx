import { useEffect } from 'react';
import { useMatchStore, formatTime } from '../store/matchStore';

interface MatchTimerProps {
  showControls?: boolean;
  /** Only the window that owns the clock should tick; the other just displays. */
  drivesClock?: boolean;
  /** Tailwind size class for the digits (board wants huge, control smaller). */
  timeClassName?: string;
}

export default function MatchTimer({
  showControls = true,
  drivesClock = true,
  timeClassName = 'text-[10rem]',
}: MatchTimerProps) {
  const seconds = useMatchStore((s) => s.seconds);
  const running = useMatchStore((s) => s.running);
  const tick = useMatchStore((s) => s.tick);
  const onStart = useMatchStore((s) => s.onStart);
  const onPause = useMatchStore((s) => s.onPause);
  const onResetTime = useMatchStore((s) => s.onResetTime);

  useEffect(() => {
    if (!running || !drivesClock) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, drivesClock, tick]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={`font-bold leading-none text-timer tabular-nums ${timeClassName}`}>
        {formatTime(seconds)}
      </div>
      {showControls && (
        <div className="flex gap-3">
          <button
            onClick={running ? onPause : onStart}
            className="rounded bg-white/10 px-6 py-2 text-lg font-semibold text-white hover:bg-white/20"
          >
            {running ? 'dừng' : 'chạy'}
          </button>
          <button
            onClick={onResetTime}
            className="rounded bg-white/10 px-6 py-2 text-lg font-semibold text-white hover:bg-white/20"
          >
            đặt lại
          </button>
        </div>
      )}
    </div>
  );
}
