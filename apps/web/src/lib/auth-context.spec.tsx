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
});
