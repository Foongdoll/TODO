import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type AuthStatus = "idle" | "loading" | "authenticated" | "error";

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  provider: string;
  notificationsEnabled: boolean;
};

type LoginCredentials = {
  email: string;
  password: string;
};

type SignUpCredentials = {
  email: string;
  password: string;
  name: string;
};

type AuthResponsePayload = {
  accessToken: string;
  email: string;
  name: string;
  provider: string;
  userId: string;
  notificationsEnabled: boolean;
};

const STORAGE_KEY = "todoongs.auth";
const API_BASE = "http://localhost:8080"; //String(import.meta.env.VITE_API_BASE ?? "").replace(/\/+$/, "");
const AUTH_ENDPOINT = API_BASE ? `${API_BASE}/auth` : "/auth";

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  error: string | null;
  signIn: (credentials: LoginCredentials) => Promise<AuthUser>;
  signUp: (credentials: SignUpCredentials) => Promise<AuthUser>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storedAuth(): { user: AuthUser; token: string } | null {
  if (typeof window === "undefined") return null;

  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return null;

    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "user" in parsed &&
      "token" in parsed
    ) {
      const obj = parsed as { user: AuthUser; token: string };
      if (obj.user && obj.token) return obj;
    }
  } catch (error) {
    console.error("todoongs: failed to parse stored auth", error);
  }

  return null;
}

function persistAuth(payload: { user: AuthUser; token: string } | null) {
  if (typeof window === "undefined") return;

  if (payload) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

// ✅ TSX에서 제네릭 화살표 함수는 깨질 수 있어서 "function"으로 선언
async function requestAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${AUTH_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("서버 응답을 해석할 수 없습니다.");
    }
  }

  if (!response.ok) {
    let message = response.statusText || "서버 요청 실패";

    if (parsed && typeof parsed === "object" && "message" in parsed) {
      const m = (parsed as { message?: unknown }).message;
      if (typeof m === "string" && m.trim()) message = m;
    }

    throw new Error(message);
  }

  return parsed as T;
}

function makeUser(payload: AuthResponsePayload): AuthUser {
  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    provider: payload.provider,
    notificationsEnabled: payload.notificationsEnabled ?? true,
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const saved = storedAuth();

  const [user, setUser] = useState<AuthUser | null>(saved?.user ?? null);
  const [token, setToken] = useState<string | null>(saved?.token ?? null);
  const [status, setStatus] = useState<AuthStatus>(
    saved ? "authenticated" : "idle"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    persistAuth(user && token ? { user, token } : null);
  }, [user, token]);

  const updateState = useCallback((payload: AuthResponsePayload) => {
    const nextUser = makeUser(payload);

    setUser(nextUser);
    setToken(payload.accessToken);
    setStatus("authenticated");
    setError(null);

    // useEffect에서도 동기화하지만, 즉시 반영 원하면 유지 가능
    persistAuth({ user: nextUser, token: payload.accessToken });

    return nextUser;
  }, []);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      setStatus("loading");
      setError(null);

      try {
        const response = await requestAuth<AuthResponsePayload>(
          "/signin",
          credentials
        );
        return updateState(response);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "로그인에 실패했습니다.";
        setStatus("error");
        setError(message);
        throw reason;
      }
    },
    [updateState]
  );

  const signUp = useCallback(
    async (credentials: SignUpCredentials) => {
      setStatus("loading");
      setError(null);

      try {
        const response = await requestAuth<AuthResponsePayload>(
          "/signup",
          credentials
        );
        return updateState(response);
      } catch (reason) {
        const message =
          reason instanceof Error ? reason.message : "회원가입에 실패했습니다.";
        setStatus("error");
        setError(message);
        throw reason;
      }
    },
    [updateState]
  );

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setStatus("idle");
    setError(null);
    persistAuth(null);
  }, []);

  const value = useMemo(
    () => ({ user, token, status, error, signIn, signUp, logout }),
    [user, token, status, error, signIn, signUp, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
