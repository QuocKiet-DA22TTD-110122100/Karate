import { useMatchStore, type FlagVote } from '../store/matchStore';

/** A row of flags, drawn in the order the judges hold them up. */
export function Flags({ vote, size = 'md' }: Readonly<{ vote: FlagVote; size?: 'sm' | 'md' | 'lg' }>) {
  const box =
    size === 'lg' ? 'h-10 w-7' : size === 'md' ? 'h-6 w-4' : 'h-4 w-3';
  return (
    <span className="flex items-center gap-1">
      {Array.from({ length: vote.aka }, (_, i) => (
        <span key={`aka${i}`} className={`${box} rounded-sm bg-aka ring-1 ring-black/20`} />
      ))}
      {Array.from({ length: vote.ao }, (_, i) => (
        <span key={`ao${i}`} className={`${box} rounded-sm bg-ao ring-1 ring-black/20`} />
      ))}
    </span>
  );
}

function VoteButton({ vote, onCast }: Readonly<{ vote: FlagVote; onCast: (v: FlagVote) => void }>) {
  const even = vote.ao === vote.aka;
  const label = even
    ? `${vote.aka}-${vote.ao} hoà`
    : `${Math.max(vote.aka, vote.ao)} ${vote.aka > vote.ao ? 'đỏ' : 'xanh'}`;
  return (
    <button
      onClick={() => onCast(vote)}
      title={even ? 'Chưa phân thắng — trọng tài chính vào quyết định' : undefined}
      className="flex flex-col items-center gap-1 rounded-lg border-2 border-neutral-300 bg-white px-2 py-2 hover:border-neutral-500"
    >
      <Flags vote={vote} />
      <span className="text-[11px] font-semibold text-neutral-600">{label}</span>
    </button>
  );
}

/**
 * The judges' flags, entered by the operator once a level match has run out of
 * tie-breaks. Four judges vote first; an even 2-2 settles nothing, so the head
 * referee joins and the same panel is cast again as 3-2.
 */
export default function FlagVotePanel() {
  const needsDecision = useMatchStore((s) => s.needsDecision);
  const flagVote = useMatchStore((s) => s.flagVote);
  const castFlagVote = useMatchStore((s) => s.castFlagVote);
  const clearFlagVote = useMatchStore((s) => s.clearFlagVote);

  if (!needsDecision) return null;

  // A 2-2 split means the head referee is now the fifth vote.
  const headRefTurn = flagVote != null && flagVote.ao === flagVote.aka;

  const fourJudges: FlagVote[] = [
    { aka: 4, ao: 0 },
    { aka: 3, ao: 1 },
    { aka: 2, ao: 2 },
    { aka: 1, ao: 3 },
    { aka: 0, ao: 4 },
  ];
  const withHeadRef: FlagVote[] = [
    { aka: 3, ao: 2 },
    { aka: 2, ao: 3 },
  ];

  return (
    <div className="flex flex-col gap-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
      <div>
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-900">
          ⚑ Biểu quyết cờ
        </h2>
        <p className="text-xs text-amber-800">
          {headRefTurn
            ? '2-2 — trọng tài chính quyết định, chọn 3-2:'
            : 'Hoà điểm, không phân được bằng VR hay đòn ghi điểm. Chọn tổ hợp cờ 4 trọng tài phụ:'}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(headRefTurn ? withHeadRef : fourJudges).map((v) => (
          <VoteButton key={`${v.aka}-${v.ao}`} vote={v} onCast={castFlagVote} />
        ))}
      </div>

      {flagVote && (
        <button
          onClick={clearFlagVote}
          className="self-start text-xs font-semibold text-amber-900 hover:underline"
        >
          Chọn lại
        </button>
      )}
    </div>
  );
}
