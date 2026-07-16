import { useEffect, useState } from 'react';
import type { Side } from '../types';
import {
  useKataStore,
  KATA_DURATIONS,
  KATA_OPTIONS,
} from '../store/kataStore';
import { formatTime } from '../store/matchStore';
import BackButton from '../components/BackButton';
import { useKataAlerts } from '../hooks/useKataAlerts';

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

// Editable identity + kata selection for one competitor (no scoring in kata).
function SideEditor(props: Readonly<{ side: Side }>) {
  const { side } = props;
  const competitor = useKataStore((s) => s[side]);
  const kata = useKataStore((s) => (side === 'ao' ? s.kataAo : s.kataAka));
  const setCompetitor = useKataStore((s) => s.setCompetitor);
  const setKata = useKataStore((s) => s.setKata);

  const isAo = side === 'ao';
  const accent = isAo ? 'bg-ao' : 'bg-aka';

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-white/5 p-4">
      <div className={`rounded px-3 py-1 text-center text-lg font-bold text-white ${accent}`}>
        {isAo ? 'AO (xanh)' : 'AKA (đỏ)'}
      </div>
      <input
        value={competitor.unit}
        onChange={(e) => setCompetitor(side, { unit: e.target.value })}
        placeholder="Đơn vị"
        className="rounded bg-white/10 px-3 py-2 text-white placeholder-white/40"
      />
      <input
        value={competitor.name}
        onChange={(e) => setCompetitor(side, { name: e.target.value })}
        placeholder="Tên vận động viên"
        className="rounded bg-white/10 px-3 py-2 text-white placeholder-white/40"
      />
      <select
        value={kata}
        onChange={(e) => setKata(side, e.target.value)}
        className="rounded bg-white/10 px-3 py-2 text-white"
      >
        {KATA_OPTIONS.map((opt) => (
          <option key={opt} value={opt} className="text-black">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function ControlKata() {
  const phase = useKataStore((s) => s.phase);
  const seconds = useKataStore((s) => s.seconds);
  const running = useKataStore((s) => s.running);
  const durationSec = useKataStore((s) => s.durationSec);
  const category = useKataStore((s) => s.category);
  const setCategory = useKataStore((s) => s.setCategory);
  const round = useKataStore((s) => s.round);
  const setRound = useKataStore((s) => s.setRound);
  const tournament = useKataStore((s) => s.tournament);
  const setTournament = useKataStore((s) => s.setTournament);
  const setDuration = useKataStore((s) => s.setDuration);
  const setSeconds = useKataStore((s) => s.setSeconds);
  const startPerform = useKataStore((s) => s.startPerform);
  const backToPrepare = useKataStore((s) => s.backToPrepare);
  const onStart = useKataStore((s) => s.onStart);
  const onPause = useKataStore((s) => s.onPause);
  const onResetTime = useKataStore((s) => s.onResetTime);
  const tick = useKataStore((s) => s.tick);
  useKataAlerts();
  const [timeInput, setTimeInput] = useState(formatTime(seconds));

  useEffect(() => {
    if (!running) setTimeInput(formatTime(seconds));
  }, [running, seconds]);

  // This window owns the clock; the display window just mirrors it.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, tick]);

  return (
    <div className="relative min-h-screen w-full bg-neutral-900 px-6 py-6 text-white">
      <BackButton />

      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex items-start justify-between pl-24">
          <div className="flex w-full max-w-md flex-col gap-2">
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Hạng cân / lứa tuổi (góc phải bảng)"
              className="w-full rounded bg-white/10 px-3 py-2 text-white placeholder-white/40"
            />
            <div className="flex gap-2">
              <input
                value={round}
                onChange={(e) => setRound(e.target.value)}
                placeholder="Vòng đấu (giữa)"
                className="w-44 rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40"
              />
              <input
                value={tournament}
                onChange={(e) => setTournament(e.target.value)}
                placeholder="Tên giải (góc trái bảng)"
                className="flex-1 rounded bg-white/10 px-3 py-1.5 text-sm text-white placeholder-white/40"
              />
            </div>
          </div>
          <button
            onClick={() =>
              window.open('/kata', 'karate-display', 'width=1280,height=800')
            }
            className="ml-4 shrink-0 rounded bg-white/10 px-4 py-2 font-semibold hover:bg-white/20"
          >
            🖥 Mở bảng chiếu
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
          <SideEditor side="ao" />

          {/* Center: duration + clock + phase controls */}
          <div className="flex min-w-[18rem] flex-col items-center gap-4 rounded-lg bg-white/5 p-4">
            {/* Performance length */}
            <div className="flex gap-2">
              {KATA_DURATIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => setDuration(sec)}
                  className={`rounded px-4 py-2 font-semibold transition-colors ${
                    durationSec === sec
                      ? 'bg-timer text-black'
                      : 'bg-white/10 text-white/80'
                  }`}
                >
                  {formatTime(sec)}
                </button>
              ))}
            </div>

            <div className="text-lg font-semibold uppercase tracking-widest text-white/70">
              {phase === 'prepare' ? 'Chuẩn bị' : 'Đi quyền'}
            </div>
            <div className="text-8xl font-bold leading-none text-timer tabular-nums">
              {formatTime(seconds)}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <button
                onClick={onStart}
                disabled={running}
                className="rounded bg-senshu px-5 py-2 text-lg font-semibold text-white disabled:opacity-40"
              >
                chạy
              </button>
              <button
                onClick={onPause}
                disabled={!running}
                className="rounded bg-aka px-5 py-2 text-lg font-semibold text-white disabled:opacity-40"
              >
                dừng
              </button>
              <button
                onClick={onResetTime}
                className="rounded bg-white/10 px-5 py-2 text-lg font-semibold text-white hover:bg-white/20"
              >
                đặt lại
              </button>
            </div>

            <div className="flex items-center gap-2 rounded border border-dashed border-white/20 px-3 py-2">
              <span className="text-sm font-semibold text-white/70">Sửa thời gian:</span>
              <input
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const next = parseTimeInput(timeInput);
                    if (next == null) return;
                    setSeconds(next);
                    setTimeInput(formatTime(next));
                  }
                }}
                disabled={running}
                placeholder="m:ss hoặc giây"
                className="w-36 rounded bg-white/10 px-3 py-1.5 text-white placeholder-white/40 disabled:opacity-50"
              />
              <button
                onClick={() => {
                  const next = parseTimeInput(timeInput);
                  if (next == null) return;
                  setSeconds(next);
                  setTimeInput(formatTime(next));
                }}
                disabled={running}
                className="rounded bg-white/10 px-4 py-1.5 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40"
              >
                Áp dụng
              </button>
            </div>

            {phase === 'prepare' ? (
              <button
                onClick={startPerform}
                className="mt-2 w-full rounded bg-ao py-3 text-lg font-bold text-white hover:opacity-90"
              >
                ▶ Bắt đầu đi quyền
              </button>
            ) : (
              <button
                onClick={backToPrepare}
                className="mt-2 w-full rounded border border-white/20 py-2 text-sm font-semibold text-white/70 hover:bg-white/10"
              >
                ↩ Về chuẩn bị
              </button>
            )}
          </div>

          <SideEditor side="aka" />
        </div>
      </div>
    </div>
  );
}
