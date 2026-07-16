import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Side } from '../types';
import {
  useMatchStore,
  formatTime,
  PENALTY_CODES,
} from '../store/matchStore';
import MatchTimer from '../components/MatchTimer';
import MiniBoardPreview from '../components/MiniBoardPreview';
import MatchQueue from '../components/MatchQueue';
import FlagVotePanel, { Flags } from '../components/FlagVotePanel';
import { useMatchAlerts } from '../hooks/useMatchAlerts';
import { useKumiteHotkeys } from '../hooks/useKumiteHotkeys';
import { useTournamentRunner } from '../hooks/useTournamentRunner';
import { useTournamentStore } from '../store/tournamentStore';
import { openDisplay } from '../lib/display';

function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.includes(':')) {
    const [minutesText, secondsText] = trimmed.split(':');
    const minutes = Number(minutesText);
    const seconds = Number(secondsText);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return Math.max(0, Math.floor(minutes) * 60 + Math.floor(seconds));
  }

  const totalSeconds = Number(trimmed);
  if (!Number.isFinite(totalSeconds)) return null;
  return Math.max(0, Math.floor(totalSeconds));
}

const POINTS = [1, 2, 3] as const;

// Key hints printed on the buttons themselves, so the map is learned in place
// rather than memorised from a legend. They mirror the layout: left hand drives
// the left side, right hand the right.
const ADD_KEYS: Record<Side, Record<number, string>> = {
  ao: { 1: 'Q', 2: 'W', 3: 'E' },
  aka: { 1: 'O', 2: 'I', 3: 'U' },
};
const SUB_KEYS: Record<Side, Record<number, string>> = {
  ao: { 1: 'A', 2: 'S', 3: 'D' },
  aka: { 1: 'L', 2: 'K', 3: 'J' },
};
const FOUL_KEYS: Record<Side, Record<string, string>> = {
  ao: { C1: '1', C2: '2', C3: '3', HC: '4', H: '5' },
  aka: { C1: '6', C2: '7', C3: '8', HC: '9', H: '0' },
};
const VR_KEYS: Record<Side, string> = { ao: 'Z', aka: 'M' };

const WIN_REASON_TEXT: Record<string, string> = {
  points: 'cách biệt 8 điểm',
  fouls: 'đối thủ đủ lỗi (H)',
  time: 'hết giờ, hơn điểm',
  senshu: 'hoà điểm — có VR',
  technique: 'hoà điểm — hơn đòn ghi điểm',
  decision: 'trọng tài biểu quyết cờ',
};

/** Why scoring is closed right now, or null when it is open. */
function lockReason(started: boolean, running: boolean, decided: boolean): string | null {
  if (decided) return 'Trận đã có kết quả';
  if (!started) return 'Trận chưa bắt đầu — bấm CHẠY trước';
  if (running) return 'Dừng đồng hồ trước khi chấm';
  return null;
}

/** Why the VR button is closed, or null when it can be pressed. VR needs the same
 *  stopped-clock state as scoring, plus at least one point already on the board.
 *  Once one side has VR the other side cannot take it. */
function vrLockReason(
  started: boolean,
  running: boolean,
  decided: boolean,
  hasScore: boolean,
  senshu: Side | null,
  side: Side
): string | null {
  const base = lockReason(started, running, decided);
  if (base) return base;
  if (!hasScore) return 'VR chỉ bật khi đã có bên ghi điểm';
  if (senshu && senshu !== side) return 'Bên kia đã dùng VR';
  return null;
}

function DurationInput({
  seconds,
  running,
  onChange,
}: Readonly<{
  seconds: number;
  running: boolean;
  onChange: (s: number) => void;
}>) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(formatTime(seconds));

  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const display = focused ? text : `${m}:${s.toString().padStart(2, '0')}`;

  return (
    <input
      value={display}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => {
        setText(formatTime(seconds));
        setFocused(true);
      }}
      onBlur={() => {
        setFocused(false);
        const next = parseTimeInput(text);
        if (next != null && next > 0 && next <= 600) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      disabled={running}
      title="Thời gian mỗi trận"
      className="w-20 rounded border-2 border-neutral-300 px-2 py-1 text-center text-sm font-bold focus:border-yellow-400 focus:outline-none disabled:opacity-40"
    />
  );
}

// A key cap printed in the corner of a control.
function KeyHint({ children }: Readonly<{ children: string }>) {
  return (
    <span className="pointer-events-none absolute right-1 top-0.5 text-[10px] font-bold leading-none opacity-60">
      {children}
    </span>
  );
}

// Score button, coloured to match its side. Live only with the clock stopped —
// the referee halts the match before awarding anything.
function ScoreButton(props: Readonly<{ side: Side; n: number; minus?: boolean }>) {
  const { side, n, minus = false } = props;
  const addPoint = useMatchStore((s) => s.addPoint);
  const locked = useMatchStore((s) => !s.started || s.running || s.winner !== null);
  const reason = useMatchStore((s) => lockReason(s.started, s.running, s.winner !== null));
  const color = side === 'ao' ? 'bg-ao' : 'bg-aka';
  const hint = minus ? SUB_KEYS[side][n] : ADD_KEYS[side][n];
  return (
    <button
      onClick={() => addPoint(side, minus ? -n : n)}
      disabled={locked}
      title={reason ?? `Phím ${hint}`}
      className={`relative grid place-items-center rounded-lg font-bold text-white ${color} hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30 ${
        minus ? 'h-11 w-16 text-xl' : 'h-[4.5rem] w-[4.5rem] text-3xl'
      }`}
    >
      <KeyHint>{hint}</KeyHint>
      {minus ? `-${n}` : n}
    </button>
  );
}

function FoulChip(props: Readonly<{ side: Side; code: string }>) {
  const { side, code } = props;
  const active = useMatchStore((s) => s.penalties[side].includes(code));
  const toggle = useMatchStore((s) => s.togglePenalty);
  const locked = useMatchStore((s) => !s.started || s.running || s.winner !== null);
  const reason = useMatchStore((s) => lockReason(s.started, s.running, s.winner !== null));
  return (
    <button
      onClick={() => toggle(side, code)}
      disabled={locked}
      title={reason ?? `Phím ${FOUL_KEYS[side][code]}`}
      className={`relative h-10 w-12 rounded-lg border-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'border-timer bg-timer text-black'
          : 'border-neutral-300 bg-neutral-100 text-neutral-700'
      }`}
    >
      <KeyHint>{FOUL_KEYS[side][code]}</KeyHint>
      {code}
    </button>
  );
}

/**
 * The strikes making up a side's score, e.g. "3+3+2". A level match is decided
 * on these, so they are worth showing rather than leaving implicit in the total.
 * Typing a score by hand cannot say *how* it was scored, so a mismatch against
 * the total is flagged instead of quietly guessed at.
 */
function StrikeLog(props: Readonly<{ side: Side }>) {
  const { side } = props;
  const log = useMatchStore((s) => s.pointLog[side]);
  const score = useMatchStore((s) => (side === 'ao' ? s.scoreAo : s.scoreAka));
  const isAo = side === 'ao';
  const sum = log.reduce((a, b) => a + b, 0);
  const mismatch = sum !== score;

  return (
    <div
      className={`flex h-5 w-full items-center gap-1 text-xs ${
        isAo ? 'justify-start' : 'justify-end'
      }`}
    >
      {log.length === 0 ? (
        <span className="text-neutral-300">chưa có đòn</span>
      ) : (
        <span className="font-mono font-semibold text-neutral-600">{log.join('+')}</span>
      )}
      {mismatch && (
        <span
          title={`Đòn ghi được cộng lại là ${sum} nhưng điểm đang là ${score}. Sửa điểm bằng nút +/- để so đòn cho đúng khi hoà.`}
          className="font-bold text-amber-600"
        >
          ⚠
        </span>
      )}
    </div>
  );
}

/**
 * One competitor's whole console: who they are, their score, and every award
 * that can go to them. Mirrored so both sides read outward-in from the clock —
 * the operator's hand stays over its own half.
 */
function SideConsole(props: Readonly<{ side: Side }>) {
  const { side } = props;
  const competitor = useMatchStore((s) => s[side]);
  const score = useMatchStore((s) => (side === 'ao' ? s.scoreAo : s.scoreAka));
  const senshu = useMatchStore((s) => s.senshu === side);
  const toggleSenshu = useMatchStore((s) => s.toggleSenshu);
  const setCompetitor = useMatchStore((s) => s.setCompetitor);
  const vrReason = useMatchStore((s) =>
    vrLockReason(s.started, s.running, s.winner !== null, s.scoreAo + s.scoreAka > 0, s.senshu, side)
  );
  const isAo = side === 'ao';

  // AKA mirrors AO: its rows run 3-2-1 so the +1 sits nearest the outer edge.
  const order = <T,>(xs: readonly T[]) => (isAo ? [...xs] : [...xs].reverse());

  return (
    <div className={`flex w-[21rem] flex-col gap-2 ${isAo ? 'items-start' : 'items-end'}`}>
      <div className={`flex w-full items-center gap-2 ${isAo ? '' : 'flex-row-reverse'}`}>
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded text-sm font-black text-white ${
            isAo ? 'bg-ao' : 'bg-aka'
          }`}
        >
          {isAo ? 'AO' : 'AK'}
        </span>
        <span className="text-3xl font-black tabular-nums">{score}</span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <input
            value={competitor.name}
            onChange={(e) => setCompetitor(side, { name: e.target.value })}
            placeholder="Tên vận động viên"
            className={`w-full rounded border border-neutral-300 px-2 py-0.5 text-sm font-bold ${
              isAo ? '' : 'text-right'
            }`}
          />
          <input
            value={competitor.unit}
            onChange={(e) => setCompetitor(side, { unit: e.target.value })}
            placeholder="Đơn vị"
            className={`w-full rounded border border-neutral-300 px-2 py-0.5 text-xs ${
              isAo ? '' : 'text-right'
            }`}
          />
        </div>
      </div>

      {/* The strikes behind the score, in the order they were given. This is what
          a level match is settled on, so the operator can see it and fix it. */}
      <StrikeLog side={side} />

      <div className="flex gap-1.5">
        {order(POINTS).map((n) => (
          <ScoreButton key={n} side={side} n={n} />
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        {order(POINTS).map((n) => (
          <ScoreButton key={`m${n}`} side={side} n={n} minus />
        ))}
        <button
          onClick={() => toggleSenshu(side)}
          disabled={vrReason !== null}
          title={vrReason ?? `VR — phím ${VR_KEYS[side]}`}
          className={`relative grid h-11 w-14 place-items-center rounded-lg text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
            senshu ? 'bg-senshu text-white' : 'border-2 border-senshu text-senshu'
          }`}
        >
          <KeyHint>{VR_KEYS[side]}</KeyHint>
          VR
        </button>
      </div>

      <div className="flex gap-1 rounded-lg bg-neutral-100 p-1">
        {order(PENALTY_CODES).map((c) => (
          <FoulChip key={c} side={side} code={c} />
        ))}
      </div>
    </div>
  );
}

/** The clock and its controls, sat between the two sides so both are a flick away. */
function ClockColumn() {
  const running = useMatchStore((s) => s.running);
  const seconds = useMatchStore((s) => s.seconds);
  const durationSec = useMatchStore((s) => s.durationSec);
  const setDuration = useMatchStore((s) => s.setDuration);
  const setSeconds = useMatchStore((s) => s.setSeconds);
  const onStart = useMatchStore((s) => s.onStart);
  const onPause = useMatchStore((s) => s.onPause);
  const onResetTime = useMatchStore((s) => s.onResetTime);
  const onResetAll = useMatchStore((s) => s.onResetAll);
  const warning = useMatchStore((s) => s.warning);
  const toggleWarning = useMatchStore((s) => s.toggleWarning);
  const dirty = useMatchStore(
    (s) => s.scoreAo > 0 || s.scoreAka > 0 || s.penalties.ao.length > 0 || s.penalties.aka.length > 0
  );

  const [timeInput, setTimeInput] = useState(formatTime(seconds));
  useEffect(() => {
    if (!running) setTimeInput(formatTime(seconds));
  }, [running, seconds]);

  return (
    <div className="flex w-56 flex-col items-center gap-1.5 rounded-xl bg-neutral-50 p-2.5">
      <MatchTimer showControls={false} drivesClock timeClassName="text-4xl" />

      <button
        onClick={onStart}
        disabled={running}
        title="Phím cách"
        className="relative w-full rounded-lg bg-senshu py-2.5 text-xl font-bold text-white hover:opacity-90 disabled:opacity-30"
      >
        <KeyHint>SPACE</KeyHint>
        CHẠY
      </button>
      <button
        onClick={onPause}
        disabled={!running}
        title="Phím cách"
        className="relative w-full rounded-lg bg-aka py-2.5 text-xl font-bold text-white hover:opacity-90 disabled:opacity-30"
      >
        <KeyHint>SPACE</KeyHint>
        DỪNG
      </button>

      <div className="flex w-full items-center justify-between gap-1">
        <span className="text-xs font-semibold text-neutral-500">Thời gian</span>
        <DurationInput seconds={durationSec} running={running} onChange={setDuration} />
      </div>

      <div className="flex w-full gap-1">
        <input
          value={timeInput}
          onChange={(e) => setTimeInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            const next = parseTimeInput(timeInput);
            if (next == null) return;
            setSeconds(next);
            setTimeInput(formatTime(next));
          }}
          disabled={running}
          placeholder="Sửa giờ: m:ss"
          title="Sửa thời gian đang chạy — Enter để áp dụng"
          className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-40"
        />
        <button
          onClick={onResetTime}
          title="Đưa đồng hồ về đầu trận, giữ nguyên điểm và lỗi"
          className="shrink-0 rounded bg-neutral-200 px-2 py-1 text-xs font-semibold hover:bg-neutral-300"
        >
          Đặt lại giờ
        </button>
      </div>

      <button
        onClick={toggleWarning}
        className={`w-full rounded py-1.5 text-xs font-bold transition-colors ${
          warning ? 'bg-warning text-white' : 'bg-neutral-200 text-neutral-600'
        }`}
      >
        warning
      </button>

      {/* Wipes the whole match — asks first once anything has been recorded. */}
      <button
        onClick={() => {
          if (dirty && !confirm('Xoá hết điểm, lỗi và đưa đồng hồ về đầu trận?')) return;
          onResetAll();
        }}
        className="w-full rounded border border-neutral-300 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-200"
      >
        Đặt lại tất cả
      </button>
    </div>
  );
}

function SecondsField(props: Readonly<{
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}>) {
  const { label, hint, value, min, max, onChange } = props;
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span className="flex flex-col">
        <span className="font-medium text-neutral-700">{label}</span>
        <span className="text-xs text-neutral-400">{hint}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={value}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n)) onChange(n);
          }}
          className="w-16 rounded border-2 border-neutral-300 px-2 py-1 text-center font-bold focus:border-yellow-400 focus:outline-none"
        />
        <span className="text-xs text-neutral-500">giây</span>
      </span>
    </label>
  );
}

function SettingsPanel() {
  const foulNoticeSec = useMatchStore((s) => s.foulNoticeSec);
  const setFoulNoticeSec = useMatchStore((s) => s.setFoulNoticeSec);
  const pointNoticeSec = useMatchStore((s) => s.pointNoticeSec);
  const setPointNoticeSec = useMatchStore((s) => s.setPointNoticeSec);
  const autoAdvanceSec = useTournamentStore((s) => s.autoAdvanceSec);
  const setAutoAdvanceSec = useTournamentStore((s) => s.setAutoAdvanceSec);
  const category = useMatchStore((s) => s.category);
  const setCategory = useMatchStore((s) => s.setCategory);
  const round = useMatchStore((s) => s.round);
  const setRound = useMatchStore((s) => s.setRound);

  return (
    <div className="flex flex-col gap-3 p-3">
      <SecondsField
        label="Hiện điểm cộng"
        hint="Ô “Point 3” trên bảng chiếu"
        value={pointNoticeSec}
        min={1}
        max={30}
        onChange={setPointNoticeSec}
      />
      <SecondsField
        label="Hiện cảnh cáo"
        hint="Ô “WARNING C1” trên bảng chiếu"
        value={foulNoticeSec}
        min={1}
        max={60}
        onChange={setFoulNoticeSec}
      />
      <SecondsField
        label="Tự chuyển trận"
        hint="Chờ sau khi có người thắng"
        value={autoAdvanceSec}
        min={0}
        max={60}
        onChange={setAutoAdvanceSec}
      />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Hạng cân / lứa tuổi</span>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1 font-bold"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-neutral-700">Vòng đấu</span>
        <input
          value={round}
          onChange={(e) => setRound(e.target.value)}
          className="rounded border border-neutral-300 px-2 py-1"
        />
      </label>
    </div>
  );
}

/** Secondary panel, folded away so it never competes with the live controls. */
function Drawer(props: Readonly<{ title: string; children: React.ReactNode; open?: boolean }>) {
  const { title, children, open = false } = props;
  return (
    <details open={open} className="group rounded-lg border border-neutral-200 bg-white shadow-sm">
      <summary className="cursor-pointer list-none px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-neutral-600 hover:bg-neutral-50">
        <span className="inline-block transition-transform group-open:rotate-90">▸</span> {title}
      </summary>
      {children}
    </details>
  );
}

export default function ControlKumite() {
  const navigate = useNavigate();
  const tournament = useMatchStore((s) => s.tournament);
  const setTournament = useMatchStore((s) => s.setTournament);
  const running = useMatchStore((s) => s.running);
  const onResetAll = useMatchStore((s) => s.onResetAll);
  const winner = useMatchStore((s) => s.winner);
  const winReason = useMatchStore((s) => s.winReason);
  const winnerName = useMatchStore((s) => (s.winner ? s[s.winner].name : ''));
  const flagVote = useMatchStore((s) => s.flagVote);
  const round = useMatchStore((s) => s.round);
  const category = useMatchStore((s) => s.category);
  const scored = useMatchStore((s) => s.scoreAo > 0 || s.scoreAka > 0);
  const started = useMatchStore((s) => s.started);
  const scoringOpen = started && !running && !winner;

  useMatchAlerts();
  // Only this window drives the running order; the projected board just mirrors.
  const runner = useTournamentRunner(true);
  useKumiteHotkeys(runner.advanceNow);

  return (
    <div className="min-h-screen w-full bg-neutral-100 px-3 py-2 text-neutral-900">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-2">
        <header className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 shadow-sm">
          <button
            onClick={() => navigate('/')}
            className="shrink-0 rounded bg-neutral-200 px-3 py-1.5 text-sm font-semibold hover:bg-neutral-300"
          >
            ← Menu
          </button>
          <input
            value={tournament}
            onChange={(e) => setTournament(e.target.value)}
            placeholder="Tên giải"
            className="min-w-0 flex-1 rounded border border-neutral-300 px-3 py-1.5 text-sm font-medium"
          />
          <span className="shrink-0 text-sm font-semibold text-neutral-500">
            {round} · {category}
          </span>
          {/* Available all match, not just after a winner: the operator may need
              to jump bouts mid-session. Confirms if it would abandon a live match. */}
          {runner.hasDraw && (
            <button
              onClick={() => {
                const live = !winner && (running || scored);
                if (live && !confirm('Trận đang đấu chưa có kết quả. Vẫn chuyển sang trận kế?')) {
                  return;
                }
                runner.advanceNow();
              }}
              title="Nạp trận chưa đấu kế tiếp — phím N"
              className="relative shrink-0 rounded bg-senshu px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Trận tiếp theo → <span className="text-xs opacity-70">N</span>
            </button>
          )}
          <button
            onClick={() => openDisplay('kumite')}
            className="shrink-0 rounded bg-neutral-800 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
          >
            🖥 Mở bảng chiếu
          </button>
        </header>

        {/* Only ever up when the match ran level to the very end. */}
        <FlagVotePanel />

        {winner && (
          <div
            className={`flex items-center justify-between gap-3 rounded-lg px-5 py-2.5 text-lg font-bold text-white ${
              winner === 'ao' ? 'bg-ao' : 'bg-aka'
            }`}
          >
            <span className="flex items-center gap-2">
              🏆 {winner === 'ao' ? 'AO' : 'AKA'} thắng — {winnerName}
              {winReason ? ` (${WIN_REASON_TEXT[winReason]})` : ''}
              {flagVote && <Flags vote={flagVote} size="sm" />}
            </span>
            <div className="flex shrink-0 gap-2">
              {runner.activeBout && (
                <button
                  onClick={runner.advanceNow}
                  className="rounded bg-white/90 px-4 py-1 text-base font-semibold text-neutral-900 hover:bg-white"
                >
                  Trận tiếp theo → <span className="text-xs opacity-60">N</span>
                </button>
              )}
              <button
                onClick={onResetAll}
                className="rounded bg-black/25 px-4 py-1 text-base hover:bg-black/40"
              >
                Đấu lại
              </button>
            </div>
          </div>
        )}

        {/* The console: AO and AKA flanking the clock, so stop→score→start is
            a short hop rather than a trip across the screen. */}
        <section className="rounded-lg bg-white p-3 shadow-sm">
          <p
            className={`mb-2 rounded px-3 py-0.5 text-center text-xs font-semibold ${
              scoringOpen ? 'bg-senshu/10 text-senshu' : 'bg-amber-100 text-amber-800'
            }`}
          >
            {winner
              ? '🏁 Trận đã có kết quả — chấm điểm đã khoá'
              : !started
                ? '▶ Trận chưa bắt đầu — bấm CHẠY (phím cách) để vào trận'
                : running
                  ? '⏸ Dừng đồng hồ (phím cách) để chấm điểm và phạt cảnh cáo'
                  : '✔ Có thể chấm điểm và phạt cảnh cáo'}
          </p>
          {/* Clustered, not spread to the edges: every award stays a short hop
              from the stop button in the middle. */}
          <div className="flex items-start justify-center gap-4">
            <SideConsole side="ao" />
            <ClockColumn />
            <SideConsole side="aka" />
          </div>
        </section>

        <div className="grid gap-2 lg:grid-cols-3">
          <Drawer title="Trận đấu theo sơ đồ" open>
            <MatchQueue runner={runner} />
          </Drawer>
          <Drawer title="Cài đặt">
            <SettingsPanel />
          </Drawer>
          <Drawer title="Xem trước bảng chiếu">
            <div className="grid place-items-center p-3">
              {/* 1.5× fills the drawer column — the operator reads this at a
                  glance mid-match, so bigger beats compact here. */}
              <MiniBoardPreview scale={1.5} />
            </div>
          </Drawer>
        </div>

        <p className="pb-1 text-center text-[11px] leading-tight text-neutral-400">
          Phím tắt — <b>Space</b> chạy/dừng · <b>Q W E</b> AO +1 +2 +3 ·{' '}
          <b>A S D</b> AO −1 −2 −3 · <b>O I U</b> AKA +1 +2 +3 · <b>L K J</b> AKA −1 −2 −3 ·{' '}
          <b>Z</b>/<b>M</b> VR · <b>1–5</b>/<b>6–0</b> cảnh cáo · <b>N</b> trận tiếp theo
        </p>
      </div>
    </div>
  );
}
