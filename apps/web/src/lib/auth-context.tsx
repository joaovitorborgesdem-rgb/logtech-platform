"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { apiFetch } from "./api-client";

interface AuthUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
}

interface StoredSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  login: (params: {
    tenantSlug: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEY = "logisense.auth";

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedSnapshot: StoredSession | null | undefined;

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function getSnapshot(): StoredSession | null {
  if (cachedSnapshot === undefined) {
    cachedSnapshot = readSession();
  }
  return cachedSnapshot;
}

function getServerSnapshot(): StoredSession | null {
  return null;
}

function setSession(session: StoredSession | null): void {
  cachedSnapshot = session;
  if (typeof window !== "undefined") {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const login = useCallback(
    async (params: { tenantSlug: string; email: string; password: string }) => {
      const result = await apiFetch<LoginResult>("/auth/login", {
        method: "POST",
        body: params,
      });

      setSession({
        user: result.user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    },
    [],
  );

  const logout = useCallback(async () => {
    const current = getSnapshot();
    if (current) {
      await apiFetch("/auth/logout", {
        method: "POST",
        token: current.accessToken,
        body: { refreshToken: current.refreshToken },
      }).catch(() => undefined);
    }

    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      accessToken: session?.accessToken ?? null,
      login,
      logout,
    }),
    [session, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
