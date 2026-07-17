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

interface FullRosterTableProps {
  rows: AthleteRecord[];
  onDelete?: (rec: AthleteRecord) => void;
  /** When true, every field becomes an input; the row stops being draggable so
      text selection doesn't fight the drag gesture. */
  editable?: boolean;
  /** Edit a field of the athlete at this index in the list. */
  onEdit?: (index: number, patch: Partial<AthleteRecord>) => void;
}

// A bare cell input matching the roster table's plain look.
function CellInput(props: Readonly<{ value: string; onChange: (v: string) => void }>) {
  return (
    <input
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
      className="w-full min-w-[4rem] bg-transparent px-1 py-0.5 outline-none focus:bg-yellow-50"
    />
  );
}

export function FullRosterTable({ rows, onDelete, editable, onEdit }: Readonly<FullRosterTableProps>) {
  if (rows.length === 0) {
    return (
      <div className="rounded border-2 border-dashed border-gray-300 p-8 text-center text-gray-400">
        Chưa có dữ liệu
      </div>
    );
  }

  const canEdit = !!(editable && onEdit);

  return (
    <div className="max-h-[560px] overflow-y-auto">
      <table className="w-full border-collapse border-2 border-black text-left text-base">
        <thead className="sticky top-0 bg-gray-100">
          <tr>
            <th className="w-10 border-2 border-black px-2 py-2 text-center">STT</th>
            <th className="border-2 border-black px-2 py-2">Họ và Tên</th>
            <th className="border-2 border-black px-2 py-2">Đơn vị</th>
            <th className="border-2 border-black px-2 py-2">Hạng cân</th>
            <th className="border-2 border-black px-2 py-2">Lứa tuổi</th>
            <th className="w-16 border-2 border-black px-2 py-2 text-center">GT</th>
            {onDelete && <th className="w-10 border-2 border-black px-2 py-2 text-center">Xóa</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={row.stt}
              draggable={!canEdit}
              onDragStart={canEdit ? undefined : (e) => startRosterDrag(e, row.name, row.unit)}
              className={canEdit ? '' : 'cursor-grab hover:bg-yellow-50 active:cursor-grabbing'}
              title={canEdit ? undefined : 'Kéo VĐV này vào sơ đồ'}
            >
              <td className="border-2 border-black px-2 py-1.5 text-center">{row.stt}</td>
              {canEdit ? (
                <>
                  <td className="border-2 border-black p-0 font-medium">
                    <CellInput value={row.name} onChange={(v) => onEdit!(index, { name: v })} />
                  </td>
                  <td className="border-2 border-black p-0">
                    <CellInput value={row.unit} onChange={(v) => onEdit!(index, { unit: v })} />
                  </td>
                  <td className="border-2 border-black p-0">
                    <CellInput value={row.category} onChange={(v) => onEdit!(index, { category: v })} />
                  </td>
                  <td className="border-2 border-black p-0">
                    <CellInput value={row.ageGroup} onChange={(v) => onEdit!(index, { ageGroup: v })} />
                  </td>
                  <td className="border-2 border-black p-0 text-center">
                    <select
                      value={row.gender}
                      onChange={(e) => onEdit!(index, { gender: e.target.value })}
                      className="w-full bg-transparent px-1 py-0.5 outline-none focus:bg-yellow-50"
                    >
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                      {row.gender !== 'Nam' && row.gender !== 'Nữ' && (
                        <option value={row.gender}>{row.gender || '—'}</option>
                      )}
                    </select>
                  </td>
                </>
              ) : (
                <>
                  <td className="border-2 border-black px-2 py-1.5 font-medium">{row.name}</td>
                  <td className="border-2 border-black px-2 py-1.5">{row.unit}</td>
                  <td className="border-2 border-black px-2 py-1.5">{row.category}</td>
                  <td className="border-2 border-black px-2 py-1.5">{row.ageGroup}</td>
                  <td className="border-2 border-black px-2 py-1.5 text-center">{row.gender}</td>
                </>
              )}
              {onDelete && (
                <td className="border-2 border-black px-1 py-1.5 text-center">
                  <button
                    onClick={() => onDelete(row)}
                    className="grid h-6 w-6 place-items-center rounded bg-red-100 text-sm font-bold text-red-600 hover:bg-red-200"
                    title="Xóa VĐV này"
                  >
                    ×
                  </button>
                </td>
              )}
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
