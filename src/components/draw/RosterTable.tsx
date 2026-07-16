import type { RosterEntry, AthleteRecord } from '../../types';
import { ROSTER_MIME } from './Bracket';

interface RosterTableProps {
  rows: RosterEntry[];
  onChange: (stt: number, patch: Partial<RosterEntry>) => void;
  editable?: boolean;
  /** When true, rows can be dragged onto a bracket slot. */
  draggable?: boolean;
}

// Attach the athlete payload (and a friendly drag image label) to a drag event.
function startRosterDrag(e: React.DragEvent, name: string, unit: string) {
  if (!name.trim()) return;
  e.dataTransfer.setData(ROSTER_MIME, JSON.stringify({ name, unit }));
  e.dataTransfer.setData('text/plain', name); // fallback for other targets
  e.dataTransfer.effectAllowed = 'copy';
}

export function FullRosterTable({ rows }: { rows: AthleteRecord[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border-2 border-dashed border-gray-300 p-8 text-center text-gray-400">
        Chưa có dữ liệu
      </div>
    );
  }

  return (
    <div className="max-h-[500px] overflow-y-auto">
      <table className="w-full border-collapse border-2 border-black text-left text-sm">
        <thead className="sticky top-0 bg-gray-100">
          <tr>
            <th className="w-10 border-2 border-black px-2 py-2 text-center">STT</th>
            <th className="border-2 border-black px-2 py-2">Họ và Tên</th>
            <th className="border-2 border-black px-2 py-2">Đơn vị</th>
            <th className="border-2 border-black px-2 py-2">Hạng cân</th>
            <th className="border-2 border-black px-2 py-2">Lứa tuổi</th>
            <th className="w-14 border-2 border-black px-2 py-2 text-center">GT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.stt}-${row.name}`}
              draggable
              onDragStart={(e) => startRosterDrag(e, row.name, row.unit)}
              className="cursor-grab hover:bg-yellow-50 active:cursor-grabbing"
              title="Kéo VĐV này vào sơ đồ"
            >
              <td className="border-2 border-black px-2 py-1.5 text-center">{row.stt}</td>
              <td className="border-2 border-black px-2 py-1.5 font-medium">{row.name}</td>
              <td className="border-2 border-black px-2 py-1.5">{row.unit}</td>
              <td className="border-2 border-black px-2 py-1.5">{row.category}</td>
              <td className="border-2 border-black px-2 py-1.5">{row.ageGroup}</td>
              <td className="border-2 border-black px-2 py-1.5 text-center">{row.gender}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function RosterTable({ rows, onChange, editable, draggable }: RosterTableProps) {
  return (
    <table className="w-full border-collapse border-2 border-black text-left">
      <thead>
        <tr>
          <th className="w-12 border-2 border-black px-2 py-2 text-center">stt</th>
          <th className="border-2 border-black px-2 py-2">Họ và Tên</th>
          <th className="border-2 border-black px-2 py-2">Đơn vị</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={3} className="border-2 border-black px-2 py-8 text-center text-gray-400">
              Chưa có dữ liệu
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            // Rows are draggable only when not being text-edited, so the drag
            // gesture doesn't fight with selecting text in the inputs.
            const rowDraggable = !!draggable && !editable;
            return (
              <tr
                key={row.stt}
                draggable={rowDraggable}
                onDragStart={
                  rowDraggable ? (e) => startRosterDrag(e, row.name, row.unit) : undefined
                }
                className={rowDraggable ? 'cursor-grab active:cursor-grabbing' : undefined}
                title={rowDraggable ? 'Kéo VĐV này vào sơ đồ' : undefined}
              >
                <td className="border-2 border-black px-2 py-2 text-center">{row.stt}</td>
                <td className="border-2 border-black p-0">
                  {editable ? (
                    <input
                      value={row.name}
                      onChange={(e) => onChange(row.stt, { name: e.target.value })}
                      className="w-full bg-transparent px-2 py-2 outline-none focus:bg-yellow-50"
                    />
                  ) : (
                    <div className="px-2 py-2">{row.name || '-'}</div>
                  )}
                </td>
                <td className="border-2 border-black p-0">
                  {editable ? (
                    <input
                      value={row.unit}
                      onChange={(e) => onChange(row.stt, { unit: e.target.value })}
                      className="w-full bg-transparent px-2 py-2 outline-none focus:bg-yellow-50"
                    />
                  ) : (
                    <div className="px-2 py-2">{row.unit || '-'}</div>
                  )}
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}
