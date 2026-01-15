import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { API_BASE } from "../api/http";

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
  refreshToken: string;
  email: string;
  name: string;
  provider: string;
  userId: string;
  notificationsEnabled: boolean;
};

type AuthStored = {
  user: AuthUser;
  token: string;
  refreshToken: string;
};

const STORAGE_KEY = "todoongs.auth";
const AUTH_ENDPOINT = `${API_BASE}/auth`;

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  refreshToken: string | null;
  status: AuthStatus;
  error: string | null;
  signIn: (credentials: LoginCredentials) => Promise<AuthUser>;
  signUp: (credentials: SignUpCredentials) => Promise<AuthUser>;
  logout: () => void;
  refreshTokens: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function storedAuth(): AuthStored | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      "user" in parsed &&
      "token" in parsed &&
      "refreshToken" in parsed
    ) {
      const candidate = parsed as AuthStored;
      if (candidate.user && candidate.token && candidate.refreshToken) {
        return candidate;
      }
    }
  } catch (error) {
    console.error("todoongs: stored auth 해석 실패", error);
  }
  return null;
}

function persistAuth(payload: AuthStored | null) {
  if (typeof window === "undefined") return;
  if (payload) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

async function requestAuth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${AUTH_ENDPOINT}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || response.statusText || "인증 요청 실패";
    throw new Error(message);
  }

  return payload as T;
}

function makeUser(payload: AuthResponsePayload): AuthUser {
  return {
    userId: payload.userId,
    email: payload.email,
    name: payload.name,
    provider: payload.provider,
    notificationsEnabled: Boolean(payload.notificationsEnabled),
  };
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const initialStoredAuth = useMemo(() => storedAuth(), []);

  const [user, setUser] = useState<AuthUser | null>(initialStoredAuth?.user ?? null);
  const [token, setToken] = useState<string | null>(initialStoredAuth?.token ?? null);
  const [refreshToken, setRefreshToken] = useState<string | null>(initialStoredAuth?.refreshToken ?? null);
  const [status, setStatus] = useState<AuthStatus>(initialStoredAuth ? "loading" : "idle");
  const [error, setError] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<boolean> | null>(null);
  const restorationRef = useRef(false);

  useEffect(() => {
    persistAuth(user && token && refreshToken ? { user, token, refreshToken } : null);
  }, [user, token, refreshToken]);

  const updateState = useCallback((payload: AuthResponsePayload) => {
    const nextUser = makeUser(payload);
    setUser(nextUser);
    setToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);
    setStatus("authenticated");
    setError(null);
    return nextUser;
  }, []);

  const signIn = useCallback(
    async (credentials: LoginCredentials) => {
      setStatus("loading");
      setError(null);
      try {
        const response = await requestAuth<AuthResponsePayload>("/signin", credentials);
        return updateState(response);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "로그인 실패";
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
        const response = await requestAuth<AuthResponsePayload>("/signup", credentials);
        return updateState(response);
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : "회원가입 실패";
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
    setRefreshToken(null);
    refreshPromiseRef.current = null;
    setStatus("idle");
    setError(null);
    persistAuth(null);
  }, []);

  const refreshTokens = useCallback(async (): Promise<boolean> => {
    if (!refreshToken) return false;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const promise = (async () => {
      try {
        const response = await requestAuth<AuthResponsePayload>("/refresh", { refreshToken });
        updateState(response);
        return true;
      } catch {
        logout();
        return false;
      } finally {
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = promise;
    return promise;
  }, [refreshToken, logout, updateState]);

  useEffect(() => {
    if (!initialStoredAuth || restorationRef.current) return;
    restorationRef.current = true;
    setStatus("loading");
    refreshTokens().catch(() => undefined);
  }, [initialStoredAuth, refreshTokens]);

  const value = useMemo(
    () => ({
      user,
      token,
      refreshToken,
      status,
      error,
      signIn,
      signUp,
      logout,
      refreshTokens,
    }),
    [user, token, refreshToken, status, error, signIn, signUp, logout, refreshTokens]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
