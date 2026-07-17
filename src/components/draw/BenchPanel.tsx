import { useState } from 'react';
import type { RosterEntry } from '../../types';
import { ROSTER_MIME } from './Bracket';

interface BenchPanelProps {
  bench: RosterEntry[];
  /** A bracket slot (identified by position) was dropped here → move to bench. */
  onDropFromBracket: (pos: number) => void;
  /** Permanently remove an athlete from the bench. */
  onRemove: (name: string, unit: string) => void;
}

// The "waiting bench": athletes pulled out of the bracket rest here. Drag a slot
// onto it to bench someone; drag an entry back onto the bracket to reinstate them.
export default function BenchPanel({ bench, onDropFromBracket, onRemove }: BenchPanelProps) {
  const [over, setOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    // A roster/bench athlete carries ROSTER_MIME; ignore those (already listed).
    if (e.dataTransfer.getData(ROSTER_MIME)) return;
    const pos = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isInteger(pos) && pos > 0) onDropFromBracket(pos);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={handleDrop}
      className={`mb-3 rounded-lg border-2 border-dashed p-2 transition-colors ${
        over ? 'border-amber-500 bg-amber-50' : 'border-gray-300 bg-gray-50'
      }`}
    >
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
        🪑 Hàng đợi (VĐV đã kéo ra){' '}
        <span className="rounded-full bg-gray-200 px-2 text-xs">{bench.length}</span>
        <span className="font-normal text-gray-400">— kéo vào đây để cất, kéo ra sơ đồ để trả lại</span>
      </div>

      {bench.length === 0 ? (
        <p className="px-1 py-2 text-xs text-gray-400">
          Chưa có ai. Kéo một VĐV từ sơ đồ thả vào đây để tạm cất.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {bench.map((a) => (
            <div
              key={`${a.name}-${a.unit}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ROSTER_MIME, JSON.stringify({ name: a.name, unit: a.unit }));
                e.dataTransfer.setData('text/plain', a.name);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              className="group flex cursor-grab items-center gap-1 rounded border border-amber-300 bg-amber-100 py-1 pl-2 pr-1 text-sm active:cursor-grabbing"
              title="Kéo VĐV này trở lại sơ đồ"
            >
              <span className="font-semibold text-black">{a.name}</span>
              <span className="text-xs text-gray-600">({a.unit})</span>
              <button
                onClick={() => onRemove(a.name, a.unit)}
                className="grid h-4 w-4 place-items-center rounded bg-red-600 text-[11px] font-bold leading-none text-white opacity-60 hover:opacity-100"
                title="Xóa hẳn khỏi hàng đợi"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
