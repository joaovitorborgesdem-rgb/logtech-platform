import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";
import { AuthProvider, useAuth } from "./auth-context";

vi.mock("./api-client", () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

const STORAGE_KEY = "logisense.auth";

const fakeUser = {
  id: "user-1",
  tenantId: "tenant-1",
  name: "Owner",
  email: "owner@example.com",
  role: "OWNER",
  mfaEnabled: false,
};

describe("AuthProvider / useAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lança erro quando usado fora do AuthProvider", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth deve ser usado dentro de um AuthProvider",
    );
  });

  it("login faz a chamada de API, guarda a sessão e expõe o usuário", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: fakeUser,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.login({
        tenantSlug: "acme",
        email: fakeUser.email,
        password: "supersecret123",
      });
    });

    await waitFor(() => {
      expect(result.current.user).toEqual(fakeUser);
    });
    expect(result.current.accessToken).toBe("access-token");
    expect(apiFetch).toHaveBeenCalledWith("/auth/login", {
      method: "POST",
      body: {
        tenantSlug: "acme",
        email: fakeUser.email,
        password: "supersecret123",
      },
    });

    const stored = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    ) as { user: typeof fakeUser } | null;
    expect(stored?.user).toEqual(fakeUser);
  });

  it("logout chama a API e limpa a sessão mesmo se a chamada falhar", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: fakeUser,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.login({
        tenantSlug: "acme",
        email: fakeUser.email,
        password: "supersecret123",
      });
    });

    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("network error"));

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("login não guarda sessão quando o MFA é exigido", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      mfaRequired: true,
      mfaToken: "mfa-token-123",
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.login({
        tenantSlug: "acme",
        email: fakeUser.email,
        password: "supersecret123",
      });
    });

    expect(outcome).toEqual({ mfaRequired: true, mfaToken: "mfa-token-123" });
    expect(result.current.user).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("verifyMfa troca o mfaToken + código por uma sessão", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: fakeUser,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.verifyMfa({ mfaToken: "mfa-token-123", code: "123456" });
    });

    expect(apiFetch).toHaveBeenCalledWith("/auth/mfa/verify", {
      method: "POST",
      body: { mfaToken: "mfa-token-123", code: "123456" },
    });
    await waitFor(() => {
      expect(result.current.user).toEqual(fakeUser);
    });
  });

  it("exchangeOAuthCode troca o código por uma sessão", async () => {
    vi.mocked(apiFetch).mockResolvedValue({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: fakeUser,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider,
    });

    await act(async () => {
      await result.current.exchangeOAuthCode("oauth-code-abc");
    });

    expect(apiFetch).toHaveBeenCalledWith("/auth/oauth/exchange", {
      method: "POST",
      body: { code: "oauth-code-abc" },
    });
    await waitFor(() => {
      expect(result.current.user).toEqual(fakeUser);
    });
  });

  describe("MFA setup", () => {
    async function loginFirst(result: {
      current: ReturnType<typeof useAuth>;
    }) {
      vi.mocked(apiFetch).mockResolvedValueOnce({
        accessToken: "access-token",
        refreshToken: "refresh-token",
        user: fakeUser,
      });
      await act(async () => {
        await result.current.login({
          tenantSlug: "acme",
          email: fakeUser.email,
          password: "supersecret123",
        });
      });
    }

    it("setupMfa chama a API autenticada", async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await loginFirst(result);

      vi.mocked(apiFetch).mockResolvedValueOnce({
        secret: "SECRET",
        otpAuthUrl: "otpauth://totp/test",
        qrCodeDataUrl: "data:image/png;base64,abc",
      });

      await act(async () => {
        await result.current.setupMfa();
      });

      expect(apiFetch).toHaveBeenCalledWith("/auth/mfa/setup", {
        method: "POST",
        token: "access-token",
      });
    });

    it("enableMfa marca o usuário local como mfaEnabled", async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await loginFirst(result);

      vi.mocked(apiFetch).mockResolvedValueOnce({
        backupCodes: ["code1", "code2"],
      });

      await act(async () => {
        await result.current.enableMfa("123456");
      });

      expect(apiFetch).toHaveBeenCalledWith("/auth/mfa/enable", {
        method: "POST",
        token: "access-token",
        body: { code: "123456" },
      });
      await waitFor(() => {
        expect(result.current.user?.mfaEnabled).toBe(true);
      });
    });

    it("disableMfa marca o usuário local como não mfaEnabled", async () => {
      const { result } = renderHook(() => useAuth(), {
        wrapper: AuthProvider,
      });
      await loginFirst(result);

      vi.mocked(apiFetch).mockResolvedValueOnce(undefined);

      await act(async () => {
        await result.current.disableMfa({ code: "123456" });
      });

      expect(apiFetch).toHaveBeenCalledWith("/auth/mfa/disable", {
        method: "POST",
        token: "access-token",
        body: { code: "123456" },
      });
      await waitFor(() => {
        expect(result.current.user?.mfaEnabled).toBe(false);
      });
    });
  });
});
