import { useNavigate } from 'react-router-dom';
import type { Runner } from '../hooks/useTournamentRunner';
import type { Bout } from '../lib/bouts';
import { useTournamentStore } from '../store/tournamentStore';

function Competitor({ athlete, side }: { athlete: Bout['aka']; side: 'aka' | 'ao' }) {
  const dot = side === 'aka' ? 'bg-aka' : 'bg-ao';
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <span className={`truncate ${athlete ? '' : 'italic text-neutral-400'}`}>
        {athlete ? athlete.name : 'chờ kết quả'}
      </span>
    </span>
  );
}

function BoutRow({
  bout,
  active,
  onLoad,
}: {
  bout: Bout;
  active: boolean;
  onLoad: () => void;
}) {
  const ready = !!bout.aka && !!bout.ao;
  return (
    <button
      onClick={onLoad}
      disabled={!ready}
      title={ready ? 'Nạp trận này lên bảng' : 'Chưa đủ đấu thủ — chờ trận trước xong'}
      className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? 'border-senshu bg-senshu/10 font-semibold'
          : 'border-neutral-200 hover:bg-neutral-50'
      }`}
    >
      <span className="w-14 shrink-0 text-xs font-bold uppercase text-neutral-500">
        {bout.isFinal ? 'CK' : `Trận ${bout.no}`}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <Competitor athlete={bout.aka} side="aka" />
        <Competitor athlete={bout.ao} side="ao" />
      </span>
      <span className="w-24 shrink-0 text-right text-xs">
        {bout.winner ? (
          <span className="font-semibold text-senshu">🏆 {bout.winner.name}</span>
        ) : active ? (
          <span className="font-semibold text-senshu">▶ đang đấu</span>
        ) : (
          <span className="text-neutral-400">chờ</span>
        )}
      </span>
    </button>
  );
}

/**
 * The running order taken from the draw: pick a class, load a bout onto the
 * board. Winners are recorded automatically as each match is decided, which is
 * what fills in the competitors of later bouts.
 */
export default function MatchQueue({ runner }: Readonly<{ runner: Runner }>) {
  const navigate = useNavigate();
  const useDraw = useTournamentStore((s) => s.useDraw);
  const setUseDraw = useTournamentStore((s) => s.setUseDraw);
  const clearResults = useTournamentStore((s) => s.clearResults);
  const {
    waiting,
    finished,
    progress,
    activeCategory,
    bouts,
    activeBout,
    allDone,
    loadBout,
    loadCategory,
    hasDraw,
  } = runner;

  if (!hasDraw) {
    return (
      <div className="m-3 rounded-lg border-2 border-dashed border-neutral-300 p-4 text-center">
        <p className="text-sm text-neutral-500">Chưa có sơ đồ bốc thăm.</p>
        <button
          onClick={() => navigate('/draw')}
          className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Đi tới Bốc thăm
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-3">
      <label className="flex items-center gap-1.5 self-end text-xs font-medium text-neutral-600">
        <input
          type="checkbox"
          checked={useDraw}
          onChange={(e) => setUseDraw(e.target.checked)}
          className="h-3.5 w-3.5"
        />
        Tự nạp &amp; ghi kết quả
      </label>

      {/* Finished classes leave the waiting group, but stay reachable below it
          so a result can still be reviewed or corrected. */}
      <select
        value={activeCategory?.key ?? ''}
        onChange={(e) => e.target.value && loadCategory(e.target.value)}
        className="rounded border-2 border-neutral-300 bg-white px-2 py-1.5 text-sm font-medium"
      >
        <option value="" disabled>
          Chọn hạng cân…
        </option>
        {waiting.length > 0 && (
          <optgroup label={`Chờ thi đấu (${waiting.length})`}>
            {waiting.map((c) => {
              const p = progress[c.key];
              return (
                <option key={c.key} value={c.key}>
                  {c.label}
                  {p && p.decided > 0 ? ` — còn ${p.total - p.decided}/${p.total} trận` : ''}
                </option>
              );
            })}
          </optgroup>
        )}
        {finished.length > 0 && (
          <optgroup label={`Đã xong (${finished.length})`}>
            {finished.map((c) => (
              <option key={c.key} value={c.key}>
                ✓ {c.label}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      {allDone ? (
        <p className="rounded bg-senshu/10 px-2 py-1.5 text-xs font-semibold text-senshu">
          ✓ Đã đấu xong toàn bộ các hạng cân.
        </p>
      ) : (
        <p className="text-xs text-neutral-400">
          Còn <b>{waiting.length}</b> hạng chờ thi đấu
          {finished.length > 0 ? ` · ${finished.length} hạng đã xong` : ''}
        </p>
      )}

      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
        {bouts.length === 0 ? (
          <p className="px-1 py-4 text-center text-sm text-neutral-400">
            Chọn hạng cân để xem danh sách trận.
          </p>
        ) : (
          bouts.map((b) => (
            <BoutRow
              key={b.no}
              bout={b}
              active={activeBout?.no === b.no}
              onLoad={() => activeCategory && loadBout(activeCategory.key, b.no)}
            />
          ))
        )}
      </div>

      {activeCategory && bouts.some((b) => b.winner) && (
        <button
          onClick={() => {
            if (confirm(`Xoá kết quả đã ghi của "${activeCategory.label}"?`)) {
              clearResults(activeCategory.key);
            }
          }}
          className="self-start text-xs font-semibold text-red-600 hover:underline"
        >
          Xoá kết quả hạng này
        </button>
      )}
    </div>
  );
}
