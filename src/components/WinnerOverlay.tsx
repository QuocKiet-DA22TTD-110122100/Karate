import { useMatchStore } from '../store/matchStore';
import Flag from './Flag';
import { Flags } from './FlagVotePanel';

const REASON_TEXT: Record<string, string> = {
  points: 'Thắng cách biệt 8 điểm',
  fouls: 'Đối thủ bị đủ lỗi (H)',
  time: 'Thắng khi hết giờ',
  senshu: 'Hoà điểm — thắng nhờ VR',
  technique: 'Hoà điểm — hơn đòn ghi điểm',
  decision: 'Trọng tài biểu quyết',
};

// Full-screen blinking celebration shown on the board when the match is
// decided. Shows the winner's full info and the word WINNER.
export default function WinnerOverlay() {
  const winner = useMatchStore((s) => s.winner);
  const winReason = useMatchStore((s) => s.winReason);
  const competitor = useMatchStore((s) => (winner ? s[winner] : null));
  const flagVote = useMatchStore((s) => s.flagVote);

  if (!winner || !competitor) return null;

  const accent = winner === 'ao' ? 'text-ao' : 'text-aka';
  const ring = winner === 'ao' ? 'ring-ao' : 'ring-aka';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85">
      <div
        className={`animate-blink-fast pointer-events-none absolute inset-0 ring-[16px] ring-inset ${ring}`}
      />
      <div className="relative flex flex-col items-center gap-4 text-center">
        <div className={`animate-blink text-8xl font-extrabold tracking-widest ${accent}`}>
          WINNER
        </div>
        <Flag country={competitor.country} className="scale-125" />
        <div className="mt-4 text-3xl font-bold text-white">{competitor.unit}</div>
        <div className="text-5xl font-extrabold text-white">{competitor.name}</div>
        <div className="mt-2 flex items-center gap-3 rounded-full bg-white/10 px-6 py-2 text-xl text-white/80">
          {winReason ? REASON_TEXT[winReason] : ''}
          {/* The flags that settled it, so the hall can see the count. */}
          {winReason === 'decision' && flagVote && <Flags vote={flagVote} size="lg" />}
        </div>
      </div>
    </div>
  );
}
