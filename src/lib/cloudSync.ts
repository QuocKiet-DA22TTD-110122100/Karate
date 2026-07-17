import type { DrawState } from './drawStorage';

// Cross-device sync for the draw, with no server of our own: the draw machine
// saves the whole DrawState into a secret GitHub Gist; any other machine loads
// it back with just the gist link. Reading needs no token (GitHub allows
// unauthenticated gist reads with CORS), so scoreboard machines stay zero-setup.
// Writing needs a personal access token with the "gist" scope, created once by
// the operator and kept in localStorage on the draw machine only.

const GIST_FILE = 'karate-draw.json';
const GIST_DESCRIPTION = 'Sơ đồ bốc thăm giải karate (lưu tự động từ app)';

export const CLOUD_TOKEN_KEY = 'karate-cloud-token';
export const CLOUD_GIST_KEY = 'karate-cloud-gist';

export interface CloudSaveResult {
  gistId: string;
  htmlUrl: string;
}

/** Accepts a bare gist id or any gist URL and returns the id, '' if neither. */
export function parseGistId(input: string): string {
  const s = input.trim();
  if (/^[0-9a-f]{10,}$/i.test(s)) return s;
  const m = /gist\.github(?:usercontent)?\.com\/(?:[\w-]+\/)?([0-9a-f]{10,})/i.exec(s);
  return m ? m[1] : '';
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function requestGist(
  method: 'POST' | 'PATCH',
  url: string,
  token: string,
  state: DrawState
): Promise<Response> {
  return fetch(url, {
    method,
    headers: authHeaders(token),
    body: JSON.stringify({
      description: GIST_DESCRIPTION,
      public: false,
      files: { [GIST_FILE]: { content: JSON.stringify(state) } },
    }),
  });
}

/**
 * Save the draw to a secret gist: updates the known gist when there is one, and
 * falls back to creating a fresh gist when it has been deleted meanwhile. The
 * returned id should be stored and reused so the share link stays stable.
 */
export async function saveDrawToGist(
  token: string,
  state: DrawState,
  gistId?: string
): Promise<CloudSaveResult> {
  let res: Response;
  if (gistId) {
    res = await requestGist('PATCH', `https://api.github.com/gists/${gistId}`, token, state);
    if (res.status === 404) {
      res = await requestGist('POST', 'https://api.github.com/gists', token, state);
    }
  } else {
    res = await requestGist('POST', 'https://api.github.com/gists', token, state);
  }

  if (res.status === 401) throw new Error('Token không hợp lệ hoặc đã hết hạn.');
  if (res.status === 403) throw new Error('Token bị từ chối — kiểm tra token có quyền "gist".');
  if (res.status === 404) throw new Error('Token thiếu quyền "gist" nên không tạo được.');
  if (!res.ok) throw new Error(`GitHub trả lỗi ${res.status}.`);

  const json = (await res.json()) as { id: string; html_url: string };
  return { gistId: json.id, htmlUrl: json.html_url };
}

/** Load the draw back from a gist id or link. No token needed. */
export async function loadDrawFromGist(idOrUrl: string): Promise<Partial<DrawState>> {
  const id = parseGistId(idOrUrl);
  if (!id) throw new Error('Mã/link gist không hợp lệ.');

  const res = await fetch(`https://api.github.com/gists/${id}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 404) throw new Error('Không tìm thấy — kiểm tra lại link.');
  if (res.status === 403) throw new Error('GitHub tạm giới hạn truy cập từ mạng này, thử lại sau ít phút.');
  if (!res.ok) throw new Error(`GitHub trả lỗi ${res.status}.`);

  const json = (await res.json()) as {
    files?: Record<string, { content: string; truncated?: boolean; raw_url: string }>;
  };
  const file = json.files?.[GIST_FILE] ?? Object.values(json.files ?? {})[0];
  if (!file) throw new Error('Gist này không chứa dữ liệu bốc thăm.');

  // The gist API truncates big files inline; the raw URL always has the rest.
  const content = file.truncated ? await (await fetch(file.raw_url)).text() : file.content;

  const parsed = JSON.parse(content) as Partial<DrawState>;
  if (!Array.isArray(parsed.allAthletes) && !parsed.brackets) {
    throw new Error('File trong gist không đúng định dạng dữ liệu bốc thăm.');
  }
  return parsed;
}
