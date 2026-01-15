// 한글 주석을 필수로 적용합니다. 이 파일은 API 요청을 담당하며 인증 토큰 자동 갱신 기능을 갖추고 있습니다.

const API_BASE = (import.meta.env.VITE_API_BASE ?? "http://3.38.237.211").replace(/\/$/, "");
// const REFRESH_PATH = "/auth/refresh";

export type AccessTokens = {
  accessToken: string;
  refreshToken: string;
};

export type ApiRequester = {
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  fetch: (path: string, options?: RequestInit) => Promise<Response>;
};

type RequesterConfig = {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  refreshTokens: () => Promise<boolean>;
  onLogout: () => void;
};

// 공통 설정을 기반으로 인증 요청기를 생성합니다.
export function createApiRequester(config: RequesterConfig): ApiRequester {
  async function sendRequest(path: string, options: RequestInit = {}, attemptRefresh = false): Promise<Response> {
    const token = config.getAccessToken();
    const headers = new Headers(options.headers ?? {});
    if (!(options.body instanceof FormData)) {
      headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
    }
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && !attemptRefresh) {
      const refreshed = await config.refreshTokens().catch(() => false);
      if (refreshed) {
        return sendRequest(path, options, true);
      }
      config.onLogout();
    }

    if (response.status === 401) {
      throw new Error("인증이 필요합니다.");
    }

    return response;
  }

  async function analyzeResponse<T>(path: string, options?: RequestInit): Promise<T> {
    const response = await sendRequest(path, options);
    const text = await response.text();
    if (!response.ok) {
      const errorMessage = text ? JSON.parse(text).message : response.statusText;
      throw new Error(errorMessage || "요청 처리에 실패했습니다.");
    }
    if (!text) {
      return null as unknown as T;
    }
    return JSON.parse(text) as T;
  }

  return {
    request: analyzeResponse,
    fetch: (path: string, options?: RequestInit) => sendRequest(path, options),
  };
}

export { API_BASE };
