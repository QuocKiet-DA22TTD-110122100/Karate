import { useMatchStore } from '../store/matchStore';
import CompetitorHeader from '../components/CompetitorHeader';
import ScorePanel from '../components/ScorePanel';
import PenaltyStrip from '../components/PenaltyStrip';
import MatchTimer from '../components/MatchTimer';
import SideTab from '../components/SideTab';
import WinnerOverlay from '../components/WinnerOverlay';
import { FoulNoticeOverlay, PointNoticeOverlay } from '../components/BoardNotice';
import { useMatchAlerts } from '../hooks/useMatchAlerts';

export default function KumiteScoreboard() {
  const ao = useMatchStore((s) => s.ao);
  const aka = useMatchStore((s) => s.aka);
  const round = useMatchStore((s) => s.round);
  const tournament = useMatchStore((s) => s.tournament);
  const category = useMatchStore((s) => s.category);
  const { warningPhase } = useMatchAlerts();

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-board px-8 py-6">
      {/* Blinking yellow border for the final 15 seconds. */}
      {warningPhase && (
        <div className="animate-blink pointer-events-none fixed inset-0 z-40 ring-[14px] ring-inset ring-timer" />
      )}
      <WinnerOverlay />
      <PointNoticeOverlay />
      <FoulNoticeOverlay />

      {/* Round label, centred at the top */}
      <div className="pointer-events-none absolute left-1/2 top-8 -translate-x-1/2 text-2xl font-semibold text-white">
        {round}
      </div>

      {/* Top: competitor headers pushed to the corners, each block centred
          (flag + VIE + unit + name) to match the Figma layout. */}
      <div className="flex items-start justify-between">
        <CompetitorHeader side="ao" competitor={ao} variant="center" />
        <CompetitorHeader side="aka" competitor={aka} variant="center" />
      </div>

      {/* Score panels: the AO/AK tab rides 20mm clear above its score box so the
          two read as separate parts from the floor. The pair is pulled up by that
          same 20mm, so lifting the tabs leaves the boxes where they were. */}
      <div className="-mt-[calc(2rem+20mm)] flex items-start justify-center gap-72">
        <div className="flex flex-col items-center gap-[20mm]">
          <SideTab side="ao" />
          <ScorePanel side="ao" interactive={false} />
        </div>
        <div className="flex flex-col items-center gap-[20mm]">
          <SideTab side="aka" />
          <ScorePanel side="aka" interactive={false} />
        </div>
      </div>

      {/* Penalty strip */}
      <div className="mt-6">
        <PenaltyStrip readOnly />
      </div>

      {/* Tournament (left) + timer (centre) + category (right), aligned high */}
      <div className="mt-4 grid flex-1 grid-cols-3 items-start gap-4">
        <div className="max-w-xs text-left text-3xl font-medium leading-tight text-white">
          {tournament}
        </div>
        <div className="flex justify-center">
          <MatchTimer showControls={false} drivesClock={false} />
        </div>
        <div className="justify-self-end max-w-xs text-right text-3xl font-medium leading-tight text-white">
          {category}
        </div>
      </div>
    </div>
  );
}
