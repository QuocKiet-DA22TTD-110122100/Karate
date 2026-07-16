import { useState } from 'react';
import type { BracketData } from '../../lib/drawAlgorithm';
import { computeBouts } from '../../lib/bouts';
import type { RosterEntry } from '../../types';

interface BracketProps {
  data: BracketData;
  /** Swap athletes at two 1-based slot positions (drag-drop or click-select). */
  onSwapSlots?: (posA: number, posB: number) => void;
  /** Remove the athlete at a slot (turns it into a bye). */
  onClearSlot?: (pos: number) => void;
  /** Set/replace the athlete's name + unit at a slot (inline edit). */
  onSetSlot?: (pos: number, name: string, unit: string) => void;
  /** Drop an athlete dragged in from the roster table (moves, never duplicates). */
  onDropAthlete?: (pos: number, name: string, unit: string) => void;
  /** Unit name to highlight (yellow), e.g. the host club. */
  highlightUnit?: string;
}

// Layout constants (px). Sizes are generous on purpose: html2canvas (used for
// the PDF export) lays text out slightly differently from the browser, so a
// tight box would clip Vietnamese stacked diacritics and descenders.
const LABEL_W = 34;
const LINE_W = 300; // competitor bar length — fits "Name (Unit)" without ellipsis
const BAR_H = 30; // gradient bar height
const TEXT_LH = 20; // label line-height: room for dấu + descenders (ễ, ượ, ạ)
const ROW_GAP = 66; // vertical gap between a match's two bars
const MATCH_H = 146; // vertical slot per first-round match
const STUB = 84; // horizontal width per merge column; also the bye seat indent
const PAD_TOP = 32;
const PAD_LEFT = 6;
const PAD_BOTTOM = 22;
const PAD_RIGHT = 20;

const RED_BAR = 'linear-gradient(90deg, #f26d6d 0%, #ffe1e1 100%)';
const BLUE_BAR = 'linear-gradient(90deg, #6d7cf2 0%, #e3e7ff 100%)';

// Payload key used when a roster row is dragged onto a slot.
export const ROSTER_MIME = 'application/x-karate-roster';

interface SlotProps {
  athlete: RosterEntry | null;
  x: number;
  lineY: number;
  side: 'red' | 'blue';
  position: number;
  selected: boolean;
  highlight: boolean;
  /** A bye athlete drawn at its inner resting node (seated), not at round 0. */
  seated?: boolean;
  onSelect?: (pos: number) => void;
  onSwap?: (from: number, to: number) => void;
  onClear?: (pos: number) => void;
  onSetSlot?: (pos: number, name: string, unit: string) => void;
  onDropAthlete?: (pos: number, name: string, unit: string) => void;
}

function Slot({
  athlete,
  x,
  lineY,
  side,
  position,
  selected,
  highlight,
  seated,
  onSelect,
  onSwap,
  onClear,
  onSetSlot,
  onDropAthlete,
}: SlotProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const interactive = !!(onSelect || onSwap || onClear || onSetSlot);
  const rosterDrop = onDropAthlete ?? onSetSlot;
  const acceptsDrop = !!(onSwap || rosterDrop);

  const startEdit = () => {
    if (!onSetSlot) return;
    setName(athlete?.name ?? '');
    setUnit(athlete?.unit ?? '');
    setEditing(true);
  };
  const saveEdit = () => {
    onSetSlot?.(position, name, unit);
    setEditing(false);
  };

  // Shared drop handling: a roster row (JSON payload) fills the slot; an existing
  // slot position (plain text) swaps the two athletes.
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const roster = e.dataTransfer.getData(ROSTER_MIME);
    if (roster && rosterDrop) {
      try {
        const r = JSON.parse(roster) as { name: string; unit: string };
        rosterDrop(position, r.name, r.unit);
        return;
      } catch {
        /* fall through to swap */
      }
    }
    const from = Number(e.dataTransfer.getData('text/plain'));
    if (from && from !== position) onSwap?.(from, position);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!acceptsDrop) return;
    e.preventDefault();
    setDragOver(true);
  };

  if (editing) {
    return (
      <div
        className="absolute z-20 flex items-center gap-1 rounded border bg-white p-1 shadow-lg"
        style={{ left: x, top: lineY - BAR_H / 2 - 2, width: LINE_W + 70 }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tên VĐV"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-1/2 rounded border px-1 py-0.5 text-[12px]"
        />
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          placeholder="Đơn vị"
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveEdit();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-1/2 rounded border px-1 py-0.5 text-[12px]"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={saveEdit}
          className="rounded bg-green-600 px-1.5 py-0.5 text-[12px] font-bold text-white"
        >
          ✓
        </button>
      </div>
    );
  }

  // Empty slot: only an interactive drop-zone during editing; nothing on export
  // (so a bye leaves no floating "Thăm trống" bar in the printed diagram).
  if (!athlete) {
    if (!acceptsDrop) return null;
    return (
      <div
        onDragOver={handleDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => onSelect?.(position)}
        className={`absolute rounded-sm border border-dashed ${
          dragOver ? 'border-green-600 bg-green-50' : 'border-gray-300 hover:border-gray-400'
        } ${selected ? 'ring-2 ring-yellow-500' : ''}`}
        style={{ left: x, top: lineY - BAR_H / 2, width: LINE_W, height: BAR_H }}
        title="Kéo VĐV từ danh sách vào đây"
      />
    );
  }

  return (
    <div
      draggable={!!onSwap}
      onDragStart={(e) => e.dataTransfer.setData('text/plain', String(position))}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => onSelect?.(position)}
      onDoubleClick={startEdit}
      className={`group absolute flex items-center rounded-sm ${
        interactive ? 'cursor-pointer' : ''
      } ${selected ? 'ring-2 ring-yellow-500' : ''} ${dragOver ? 'ring-2 ring-green-600' : ''} ${
        seated ? 'shadow-sm ring-1 ring-black/10' : ''
      }`}
      style={{
        left: x,
        top: lineY - BAR_H / 2,
        width: LINE_W,
        height: BAR_H,
        background: side === 'red' ? RED_BAR : BLUE_BAR,
      }}
      title={interactive ? 'Kéo-thả để đổi chỗ · nhấp đúp để sửa' : undefined}
    >
      <span
        className={`mx-1 whitespace-nowrap rounded-sm border border-black/10 px-1 text-[13px] font-semibold text-black ${
          highlight ? 'bg-yellow-300' : 'bg-white/90'
        }`}
        style={{ lineHeight: `${TEXT_LH}px` }}
      >
        {athlete.name}
        <span className="font-normal text-gray-600"> ({athlete.unit})</span>
      </span>
      {onClear && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClear(position);
          }}
          className="absolute right-1 hidden h-4 w-4 place-items-center rounded bg-red-600 text-[11px] font-bold leading-none text-white group-hover:grid"
          title="Xóa khỏi sơ đồ"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function Bracket({
  data,
  onSwapSlots,
  onClearSlot,
  onSetSlot,
  onDropAthlete,
  highlightUnit,
}: BracketProps) {
  const round0 = data.rounds[0]?.matches ?? [];
  const matchCount = round0.length;
  const [selected, setSelected] = useState<number | null>(null);

  const handleSelect = (pos: number) => {
    if (!onSwapSlots) return;
    if (selected === null) setSelected(pos);
    else if (selected === pos) setSelected(null);
    else {
      onSwapSlots(selected, pos);
      setSelected(null);
    }
  };

  if (matchCount === 0) {
    return (
      <div className="flex items-center justify-center p-12 text-gray-400">
        <p>Chưa có dữ liệu. Nhập VĐV hoặc import file.</p>
      </div>
    );
  }

  const levels = Math.max(0, Math.round(Math.log2(matchCount)));

  const barX = PAD_LEFT + LABEL_W;
  const barEnd = barX + LINE_W;
  const mergeX = (l: number) => barEnd + l * STUB; // l = 1..levels
  const championX = barEnd + (levels + 1) * STUB;
  // A bye athlete is seated at the first merge column, its bar ending on the junction.
  const seatX = mergeX(1) - LINE_W;

  const centers: number[][] = [];
  centers[0] = round0.map((_, i) => PAD_TOP + i * MATCH_H + MATCH_H / 2);
  for (let l = 1; l <= levels; l++) {
    const prev = centers[l - 1];
    centers[l] = [];
    for (let j = 0; j < prev.length / 2; j++) {
      centers[l][j] = (prev[2 * j] + prev[2 * j + 1]) / 2;
    }
  }

  // Which subtrees actually contain an athlete — used to avoid drawing skeleton
  // lines through fully-empty regions (can happen after manual clears).
  const hasContent: boolean[][] = [];
  hasContent[0] = round0.map((m) => !!m.left || !!m.right);
  for (let l = 1; l <= levels; l++) {
    hasContent[l] = [];
    for (let j = 0; j < hasContent[l - 1].length / 2; j++) {
      hasContent[l][j] = hasContent[l - 1][2 * j] || hasContent[l - 1][2 * j + 1];
    }
  }

  const width = championX + PAD_RIGHT;
  const height = PAD_TOP + matchCount * MATCH_H + PAD_BOTTOM;

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  round0.forEach((m, i) => {
    const yc = centers[0][i];
    // Only a real (contested) match gets a round-0 pairing bracket. A bye's
    // single athlete is promoted to the merge column and connects there.
    if (m.left && m.right) {
      lines.push({ x1: barEnd, y1: yc - ROW_GAP / 2, x2: barEnd, y2: yc + ROW_GAP / 2 });
      lines.push({ x1: barEnd, y1: yc, x2: mergeX(1), y2: yc });
    }
  });
  for (let l = 1; l <= levels; l++) {
    const prev = centers[l - 1];
    const x = mergeX(l);
    const outX = l === levels ? championX : mergeX(l + 1);
    for (let j = 0; j < centers[l].length; j++) {
      if (!hasContent[l][j]) continue;
      lines.push({ x1: x, y1: prev[2 * j], x2: x, y2: prev[2 * j + 1] });
      lines.push({ x1: x, y1: centers[l][j], x2: outX, y2: centers[l][j] });
    }
  }

  // Bout numbers, written on the line their winner leaves by. Numbering comes
  // from the shared bout list so the printed sheet and the scoreboard agree.
  const boutLabels = computeBouts(data).map((b) => ({
    x: b.level === 0 ? barEnd : mergeX(b.level),
    y: centers[b.level][b.index],
    text: `trận ${b.no}`,
  }));

  const isHi = (a: RosterEntry | null) =>
    !!highlightUnit && !!a && a.unit.toLowerCase() === highlightUnit.toLowerCase();

  const slotProps = (pos: number, a: RosterEntry | null) => ({
    selected: selected === pos,
    highlight: isHi(a),
    onSelect: onSwapSlots ? handleSelect : undefined,
    onSwap: onSwapSlots,
    onClear: onClearSlot,
    onSetSlot,
    onDropAthlete,
  });

  return (
    <div className="pb-2">
      <div className="relative" style={{ width, height }}>
        <svg width={width} height={height} className="absolute inset-0">
          {lines.map((ln, idx) => (
            <line
              key={idx}
              x1={ln.x1}
              y1={ln.y1}
              x2={ln.x2}
              y2={ln.y2}
              stroke="#374151"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        <div
          className="absolute text-sm font-bold uppercase tracking-wide text-gray-700"
          style={{ left: mergeX(levels) + 4, top: 8 }}
        >
          Chung kết
        </div>

        {/* Bout number rides above the line its winner leaves by. The offset keeps
            it clear of the line even in the PDF, where html2canvas draws text
            lower than the browser does. */}
        {boutLabels.map((lb) => (
          <div
            key={lb.text}
            className="absolute text-center text-[11px] font-semibold text-gray-600"
            style={{ left: lb.x, top: lb.y - 21, width: STUB, lineHeight: '12px' }}
          >
            {lb.text}
          </div>
        ))}

        {round0.map((match, i) => {
          const yc = centers[0][i];
          const leftPos = 2 * i + 1;
          const rightPos = 2 * i + 2;
          const contested = !!match.left && !!match.right;
          const bye = !!match.left !== !!match.right;

          return (
            <div key={match.id}>
              {contested && (
                <>
                  <Slot
                    athlete={match.left}
                    x={barX}
                    lineY={yc - ROW_GAP / 2}
                    side="red"
                    position={leftPos}
                    {...slotProps(leftPos, match.left)}
                  />
                  <Slot
                    athlete={match.right}
                    x={barX}
                    lineY={yc + ROW_GAP / 2}
                    side="blue"
                    position={rightPos}
                    {...slotProps(rightPos, match.right)}
                  />
                </>
              )}

              {bye && (
                <>
                  {/* Byed athlete seated inside the bracket at the merge column.
                      Its colour follows the seat it now occupies in that inner
                      match — upper feeder = aka (red), lower = ao (blue) — not the
                      round-0 slot it came from, so two byes meeting there read as
                      a proper red-vs-blue bout. */}
                  <Slot
                    athlete={match.left ?? match.right}
                    x={seatX}
                    lineY={yc}
                    side={i % 2 === 0 ? 'red' : 'blue'}
                    position={match.left ? leftPos : rightPos}
                    seated
                    {...slotProps(match.left ? leftPos : rightPos, match.left ?? match.right)}
                  />
                  {/* The empty partner stays a drop-zone during editing only. */}
                  <Slot
                    athlete={null}
                    x={barX}
                    lineY={match.left ? yc + ROW_GAP / 2 : yc - ROW_GAP / 2}
                    side={match.left ? 'blue' : 'red'}
                    position={match.left ? rightPos : leftPos}
                    {...slotProps(match.left ? rightPos : leftPos, null)}
                  />
                </>
              )}

              {!contested && !bye && (
                <>
                  <Slot
                    athlete={null}
                    x={barX}
                    lineY={yc - ROW_GAP / 2}
                    side="red"
                    position={leftPos}
                    {...slotProps(leftPos, null)}
                  />
                  <Slot
                    athlete={null}
                    x={barX}
                    lineY={yc + ROW_GAP / 2}
                    side="blue"
                    position={rightPos}
                    {...slotProps(rightPos, null)}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
