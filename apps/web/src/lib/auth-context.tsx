"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
} from "react";
import { apiFetch } from "./api-client";
import {
  getServerSnapshot,
  getSnapshot,
  setSession,
  StoredAuthUser,
  subscribeSession,
} from "./session-store";

type AuthUser = StoredAuthUser;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

export interface MfaRequiredResult {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginOutcome = AuthResult | MfaRequiredResult;

export interface MfaSetupResult {
  secret: string;
  otpAuthUrl: string;
  qrCodeDataUrl: string;
}

export interface MfaEnableResult {
  backupCodes: string[];
}

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  initialized: boolean;
  login: (params: {
    tenantSlug: string;
    email: string;
    password: string;
  }) => Promise<LoginOutcome>;
  verifyMfa: (params: { mfaToken: string; code: string }) => Promise<void>;
  exchangeOAuthCode: (code: string) => Promise<LoginOutcome>;
  setupMfa: () => Promise<MfaSetupResult>;
  enableMfa: (code: string) => Promise<MfaEnableResult>;
  disableMfa: (credential: {
    password?: string;
    code?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
}

function applyLoginOutcome(outcome: LoginOutcome): LoginOutcome {
  if (!("mfaRequired" in outcome)) {
    setSession({
      user: outcome.user,
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
    });
  }
  return outcome;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const session = useSyncExternalStore(
    subscribeSession,
    getSnapshot,
    getServerSnapshot,
  );

  // getServerSnapshot() always returns null (no session on the server), so
  // every fresh page load briefly hydrates with session=null even when a
  // valid session sits in localStorage. Callers must wait for this to flip
  // to true before treating a null user as "logged out".
  const initialized = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const login = useCallback(
    async (params: { tenantSlug: string; email: string; password: string }) => {
      const result = await apiFetch<LoginOutcome>("/auth/login", {
        method: "POST",
        body: params,
      });
      return applyLoginOutcome(result);
    },
    [],
  );

  const verifyMfa = useCallback(
    async (params: { mfaToken: string; code: string }) => {
      const result = await apiFetch<AuthResult>("/auth/mfa/verify", {
        method: "POST",
        body: params,
      });
      applyLoginOutcome(result);
    },
    [],
  );

  const exchangeOAuthCode = useCallback(async (code: string) => {
    const result = await apiFetch<LoginOutcome>("/auth/oauth/exchange", {
      method: "POST",
      body: { code },
    });
    return applyLoginOutcome(result);
  }, []);

  const setupMfa = useCallback(async () => {
    const current = getSnapshot();
    if (!current) throw new Error("Não autenticado");
    return apiFetch<MfaSetupResult>("/auth/mfa/setup", {
      method: "POST",
      token: current.accessToken,
    });
  }, []);

  const enableMfa = useCallback(async (code: string) => {
    const current = getSnapshot();
    if (!current) throw new Error("Não autenticado");
    const result = await apiFetch<MfaEnableResult>("/auth/mfa/enable", {
      method: "POST",
      token: current.accessToken,
      body: { code },
    });
    setSession({
      ...current,
      user: { ...current.user, mfaEnabled: true },
    });
    return result;
  }, []);

  const disableMfa = useCallback(
    async (credential: { password?: string; code?: string }) => {
      const current = getSnapshot();
      if (!current) throw new Error("Não autenticado");
      await apiFetch("/auth/mfa/disable", {
        method: "POST",
        token: current.accessToken,
        body: credential,
      });
      setSession({
        ...current,
        user: { ...current.user, mfaEnabled: false },
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
      initialized,
      login,
      verifyMfa,
      exchangeOAuthCode,
      setupMfa,
      enableMfa,
      disableMfa,
      logout,
    }),
    [
      session,
      initialized,
      login,
      verifyMfa,
      exchangeOAuthCode,
      setupMfa,
      enableMfa,
      disableMfa,
      logout,
    ],
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
