import type { Side } from '../types';
import { useMatchStore, PENALTY_CODES } from '../store/matchStore';

// A single penalty button. Hidden by default (text only); lights up gold
// once toggled on, matching the Figma design.
function PenaltyCell({
  side,
  code,
  readOnly,
}: {
  side: Side;
  code: string;
  readOnly: boolean;
}) {
  const active = useMatchStore((s) => s.penalties[side].includes(code));
  const toggle = useMatchStore((s) => s.togglePenalty);
  return (
    <button
      onClick={() => !readOnly && toggle(side, code)}
      tabIndex={readOnly ? -1 : 0}
      className={`h-12 flex-1 rounded-lg text-lg font-bold outline-none transition-colors ${
        active ? 'bg-timer text-black' : 'bg-timer/30 text-black/60'
      } ${readOnly ? 'cursor-default' : ''}`}
    >
      {code}
    </button>
  );
}

interface PenaltyStripProps {
  /** Display board passes this so the strip only reflects state, no toggling. */
  readOnly?: boolean;
}

export default function PenaltyStrip({ readOnly = false }: PenaltyStripProps) {
  const warning = useMatchStore((s) => s.warning);
  const toggleWarning = useMatchStore((s) => s.toggleWarning);

  return (
    <div className="flex w-full items-stretch gap-2 bg-black px-2 py-2">
      {/* AO side: C1 C2 C3 HC H, rounded gold buttons with small gaps */}
      <div className="flex flex-1 items-stretch gap-2">
        {PENALTY_CODES.map((c) => (
          <PenaltyCell key={`ao-${c}`} side="ao" code={c} readOnly={readOnly} />
        ))}
      </div>

      {/* Center warning — always a visible blue box; a white ring marks it active. */}
      <button
        onClick={() => !readOnly && toggleWarning()}
        tabIndex={readOnly ? -1 : 0}
        className={`grid min-w-[10rem] place-items-center rounded-lg bg-warning px-6 text-xl font-bold text-white outline-none transition-all ${
          warning ? 'ring-4 ring-white' : ''
        } ${readOnly ? 'cursor-default' : ''}`}
      >
        warning
      </button>

      {/* AKA side: H HC C3 C2 C1 (mirrored), rounded gold buttons with small gaps */}
      <div className="flex flex-1 items-stretch gap-2">
        {[...PENALTY_CODES].reverse().map((c) => (
          <PenaltyCell key={`aka-${c}`} side="aka" code={c} readOnly={readOnly} />
        ))}
      </div>
    </div>
  );
}
