import type { Side } from '../types';
import { useMatchStore } from '../store/matchStore';

interface ScorePanelProps {
  side: Side;
  interactive?: boolean;
}

export default function ScorePanel({ side, interactive = true }: ScorePanelProps) {
  const score = useMatchStore((s) => (side === 'ao' ? s.scoreAo : s.scoreAka));
  const senshu = useMatchStore((s) => s.senshu);
  const addPoint = useMatchStore((s) => s.addPoint);

  const bg = side === 'ao' ? 'bg-ao' : 'bg-aka';
  const hasSenshu = senshu === side;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative grid h-80 w-64 place-items-center rounded ${bg}`}>
        <span className="text-[13rem] font-black leading-none text-white">{score}</span>
        {hasSenshu && (
          <span className="absolute bottom-2 right-2 grid h-12 w-16 place-items-center rounded-xl bg-gradient-to-b from-[#4cc76d] to-[#2b8f4c] text-xl font-extrabold tracking-wider text-white shadow-[0_3px_10px_rgba(0,0,0,0.45)] ring-2 ring-white/50">
            VR
          </span>
        )}
      </div>
      {interactive && (
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              onClick={() => addPoint(side, n)}
              className="rounded bg-white/10 px-4 py-2 text-lg font-semibold text-white hover:bg-white/20"
            >
              +{n}
            </button>
          ))}
          <button
            onClick={() => addPoint(side, -1)}
            className="rounded bg-white/10 px-4 py-2 text-lg font-semibold text-white hover:bg-white/20"
          >
            −1
          </button>
        </div>
      )}
    </div>
  );
}
