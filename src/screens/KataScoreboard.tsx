import { useKataStore } from '../store/kataStore';
import { formatTime } from '../store/matchStore';
import CompetitorHeader from '../components/CompetitorHeader';
import SideTab from '../components/SideTab';
import { useKataAlerts } from '../hooks/useKataAlerts';
import type { Side } from '../types';

// Read-only kata name shown as a dropdown-styled box under each competitor.
function KataName({ side }: { side: Side }) {
  const value = useKataStore((s) => (side === 'ao' ? s.kataAo : s.kataAka));
  return (
    <div className="mt-2 flex w-56 items-center justify-between rounded bg-gray-200 px-4 py-2 text-xl font-semibold text-black">
      <span className="flex-1 text-center">{value}</span>
      <span className="text-base">⌄</span>
    </div>
  );
}

export default function KataScoreboard() {
  const ao = useKataStore((s) => s.ao);
  const aka = useKataStore((s) => s.aka);
  const round = useKataStore((s) => s.round);
  const tournament = useKataStore((s) => s.tournament);
  const category = useKataStore((s) => s.category);
  const seconds = useKataStore((s) => s.seconds);
  const phase = useKataStore((s) => s.phase);
  const { warningPhase } = useKataAlerts();

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-board px-8 py-6">
      {warningPhase && (
        <div className="animate-blink pointer-events-none fixed inset-0 z-40 ring-[14px] ring-inset ring-timer" />
      )}

      {/* Round label, centred at the top */}
      <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 text-2xl font-semibold text-white">
        {round}
      </div>

      {/* Corner blocks: flag + VIE → tab → unit + name → kata dropdown */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center">
          <CompetitorHeader side="ao" competitor={ao} variant="center">
            <SideTab side="ao" />
          </CompetitorHeader>
          <KataName side="ao" />
        </div>
        <div className="flex flex-col items-center">
          <CompetitorHeader side="aka" competitor={aka} variant="center">
            <SideTab side="aka" />
          </CompetitorHeader>
          <KataName side="aka" />
        </div>
      </div>

      {/* Phase label + big timer, with tournament / category at the bottom */}
      <div className="relative flex flex-1 flex-col items-center justify-center gap-2">
        <div className="text-2xl font-semibold uppercase tracking-widest text-white/70">
          {phase === 'prepare' ? 'Chuẩn bị' : 'Đi quyền'}
        </div>
        <div className="text-[12rem] font-black leading-none text-timer tabular-nums">
          {formatTime(seconds)}
        </div>
        <div className="absolute bottom-2 left-2 max-w-xs text-left text-3xl font-medium leading-tight text-white">
          {tournament}
        </div>
        <div className="absolute bottom-2 right-2 max-w-xs text-right text-3xl font-medium leading-tight text-white">
          {category}
        </div>
      </div>
    </div>
  );
}
