import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { Side } from '../types';
import { useMatchStore, formatTime, PENALTY_CODES } from '../store/matchStore';
import { Star } from './Flag';

/**
 * Draws children at `scale` while still occupying their scaled size in the
 * layout — a bare transform would paint bigger but reserve the original box.
 *
 * The height is observed rather than assumed: the board's category caption wraps
 * to a second line on longer classes, so the natural size is not a constant.
 */
function ScaleBox({ scale, children }: Readonly<{ scale: number; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setSize({ w: el.offsetWidth, h: el.offsetHeight })
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div style={{ width: size.w * scale, height: size.h * scale }}>
      <div
        ref={ref}
        className="w-max origin-top-left"
        style={{ transform: `scale(${scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

// A small live thumbnail of the kumite board, shown on the control panel so the
// operator sees exactly what's on the projector (matches the Figma layout).
function MiniHeader({ side }: { side: Side }) {
  const c = useMatchStore((s) => s[side]);
  const label = side === 'ao' ? 'AO' : 'AK';
  const tab = side === 'ao' ? 'bg-ao' : 'bg-aka';
  return (
    <div className="flex flex-col items-center gap-0.5 text-[8px] leading-tight text-white">
      {/* Star kept at the board's own star-to-flag ratio, so the preview stays
          a faithful thumbnail of what is projected. */}
      <div className="grid h-4 w-6 place-items-center rounded-sm bg-red-600">
        <Star className="h-3 w-3 fill-timer" />
      </div>
      <span className="font-bold">{c.country}</span>
      <div className={`h-2 w-6 rounded-sm ${tab}`} />
      <span className="text-timer">{label}</span>
      <span className="font-semibold">{c.unit}</span>
      <span className="max-w-[70px] truncate font-bold">{c.name}</span>
    </div>
  );
}

function MiniScore({ side }: { side: Side }) {
  const score = useMatchStore((s) => (side === 'ao' ? s.scoreAo : s.scoreAka));
  const hasSenshu = useMatchStore((s) => s.senshu === side);
  const bg = side === 'ao' ? 'bg-ao' : 'bg-aka';
  return (
    <div className={`relative grid h-16 w-16 place-items-center rounded ${bg}`}>
      <span className="text-4xl font-light text-white">{score}</span>
      {hasSenshu && (
        <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-senshu px-1 text-[7px] font-bold text-black">
          VR
        </span>
      )}
    </div>
  );
}

function MiniFoul({ side, code }: { side: Side; code: string }) {
  const active = useMatchStore((s) => s.penalties[side].includes(code));
  return (
    <span
      className={`rounded-sm px-1 text-[8px] font-bold ${
        active ? 'bg-timer text-black' : 'bg-timer/30 text-black/60'
      }`}
    >
      {code}
    </span>
  );
}

export default function MiniBoardPreview({ scale = 1 }: Readonly<{ scale?: number }>) {
  const seconds = useMatchStore((s) => s.seconds);
  const category = useMatchStore((s) => s.category);
  const warning = useMatchStore((s) => s.warning);

  return (
    <ScaleBox scale={scale}>
    <div className="flex w-[300px] flex-col gap-1 rounded-lg bg-board p-2">
      <div className="flex items-start justify-between">
        <MiniHeader side="ao" />
        <span className="pt-1 text-[8px] text-white/70">Trận vòng loại</span>
        <MiniHeader side="aka" />
      </div>

      <div className="flex items-center justify-center gap-6">
        <MiniScore side="ao" />
        <MiniScore side="aka" />
      </div>

      <div className="flex items-center justify-between bg-black px-1 py-0.5">
        <span className="flex gap-0.5">
          {PENALTY_CODES.map((c) => (
            <MiniFoul key={`ao-${c}`} side="ao" code={c} />
          ))}
        </span>
        <span
          className={`px-1 text-[8px] font-bold ${
            warning ? 'rounded-sm bg-warning text-white' : 'text-white/70'
          }`}
        >
          warning
        </span>
        <span className="flex gap-0.5">
          {[...PENALTY_CODES].reverse().map((c) => (
            <MiniFoul key={`aka-${c}`} side="aka" code={c} />
          ))}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-timer tabular-nums">
          {formatTime(seconds)}
        </span>
        <span className="max-w-[110px] text-right text-[8px] leading-tight text-white">
          {category}
        </span>
      </div>
    </div>
    </ScaleBox>
  );
}
