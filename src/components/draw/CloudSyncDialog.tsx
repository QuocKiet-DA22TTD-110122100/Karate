import { useState } from 'react';
import type { DrawState } from '../../lib/drawStorage';
import {
  saveDrawToGist,
  loadDrawFromGist,
  parseGistId,
  CLOUD_TOKEN_KEY,
  CLOUD_GIST_KEY,
} from '../../lib/cloudSync';

interface CloudSyncDialogProps {
  open: boolean;
  onClose: () => void;
  /** Snapshot of the current draw, read at save time. */
  getState: () => DrawState;
  /** Cloud data fetched — replace the local draw with it. */
  onLoaded: (state: Partial<DrawState>) => void;
  /** True when this machine already has draw data (load asks before wiping it). */
  hasLocalData: boolean;
}

/**
 * Cross-device sync panel. GitHub Pages hosts only static files, so each
 * browser's localStorage is an island — this bridges them through a secret
 * gist: the draw machine saves (needs a one-time token), every other machine
 * loads with just the link.
 */
export default function CloudSyncDialog({
  open,
  onClose,
  getState,
  onLoaded,
  hasLocalData,
}: Readonly<CloudSyncDialogProps>) {
  const [token, setToken] = useState(() => localStorage.getItem(CLOUD_TOKEN_KEY) ?? '');
  const [gistInput, setGistInput] = useState(() => localStorage.getItem(CLOUD_GIST_KEY) ?? '');
  const [busy, setBusy] = useState<'save' | 'load' | null>(null);
  const [error, setError] = useState('');
  const [savedUrl, setSavedUrl] = useState('');
  const [loadedOk, setLoadedOk] = useState(false);

  if (!open) return null;

  const handleSave = async () => {
    if (!token.trim()) {
      setError('Cần dán GitHub token (bước 1) trước khi lưu.');
      return;
    }
    setBusy('save');
    setError('');
    setSavedUrl('');
    try {
      localStorage.setItem(CLOUD_TOKEN_KEY, token.trim());
      const knownId = parseGistId(gistInput) || undefined;
      const result = await saveDrawToGist(token, getState(), knownId);
      localStorage.setItem(CLOUD_GIST_KEY, result.gistId);
      setGistInput(result.gistId);
      setSavedUrl(result.htmlUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lưu thất bại.');
    } finally {
      setBusy(null);
    }
  };

  const handleLoad = async () => {
    if (
      hasLocalData &&
      !confirm('Tải từ đám mây sẽ THAY THẾ toàn bộ dữ liệu bốc thăm trên máy này. Tiếp tục?')
    ) {
      return;
    }
    setBusy('load');
    setError('');
    setLoadedOk(false);
    try {
      const state = await loadDrawFromGist(gistInput);
      localStorage.setItem(CLOUD_GIST_KEY, parseGistId(gistInput));
      onLoaded(state);
      setLoadedOk(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tải thất bại.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">☁ Đồng bộ giữa các máy</h2>
            <p className="mt-1 text-xs text-gray-500">
              Trang chạy trên GitHub Pages không có máy chủ lưu trữ — dữ liệu chỉ nằm trong
              trình duyệt từng máy. Lưu lên đám mây (GitHub Gist, miễn phí) để máy khác tải
              về nguyên trạng sơ đồ đã bốc.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm font-semibold text-gray-500 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {/* Save — the draw machine */}
        <div className="mt-4 rounded-lg border border-gray-200 p-3">
          <h3 className="text-sm font-bold">1️⃣ Máy bốc thăm: lưu lên đám mây</h3>
          <p className="mt-1 text-xs text-gray-500">
            Cần GitHub token (tạo một lần):{' '}
            <a
              href="https://github.com/settings/tokens/new?scopes=gist&description=karate-tournament"
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-blue-600 underline"
            >
              mở trang tạo token
            </a>{' '}
            → chọn quyền <b>gist</b> → Generate → dán vào đây. Token chỉ lưu trên máy này.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_… hoặc github_pat_…"
              className="min-w-0 flex-1 rounded border-2 border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleSave}
              disabled={busy !== null}
              className="shrink-0 rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {busy === 'save' ? 'Đang lưu…' : '⬆ Lưu lên đám mây'}
            </button>
          </div>
          {savedUrl && (
            <div className="mt-2 rounded bg-green-50 px-2 py-1.5 text-xs text-green-800">
              ✔ Đã lưu. Gửi link này cho máy khác:{' '}
              <code className="break-all font-semibold">{savedUrl}</code>{' '}
              <button
                onClick={() => navigator.clipboard?.writeText(savedUrl)}
                className="ml-1 rounded bg-green-600 px-2 py-0.5 font-semibold text-white hover:bg-green-700"
              >
                Chép link
              </button>
            </div>
          )}
        </div>

        {/* Load — any other machine */}
        <div className="mt-3 rounded-lg border border-gray-200 p-3">
          <h3 className="text-sm font-bold">2️⃣ Máy khác: tải về (không cần token)</h3>
          <p className="mt-1 text-xs text-gray-500">
            Dán link (hoặc mã) nhận được từ máy bốc thăm rồi bấm Tải về.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={gistInput}
              onChange={(e) => setGistInput(e.target.value)}
              placeholder="https://gist.github.com/… hoặc mã gist"
              className="min-w-0 flex-1 rounded border-2 border-gray-300 px-2 py-1.5 text-sm"
            />
            <button
              onClick={handleLoad}
              disabled={busy !== null || !gistInput.trim()}
              className="shrink-0 rounded bg-emerald-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              {busy === 'load' ? 'Đang tải…' : '⬇ Tải về máy này'}
            </button>
          </div>
          {loadedOk && (
            <p className="mt-2 rounded bg-green-50 px-2 py-1.5 text-xs font-semibold text-green-800">
              ✔ Đã tải xong — sơ đồ bốc thăm đã thay bằng bản trên đám mây.
            </p>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700">
            ⚠ {error}
          </p>
        )}

        <p className="mt-3 text-[11px] leading-snug text-gray-400">
          Lưu ý: gist ở chế độ “secret” — không hiện công khai, nhưng <b>ai có link đều xem
          được</b>. Danh sách chứa họ tên VĐV, chỉ gửi link cho người trong ban tổ chức.
          Không có mạng thì vẫn dùng được cách cũ: “⬇ Xuất Excel kèm số thăm” rồi chép file
          qua USB/Zalo và import ở máy kia.
        </p>
      </div>
    </div>
  );
}
