import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api-client";
import { getSnapshot, setSession } from "./session-store";

function mockFetchResponse(
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
): void {
  const status = init.status ?? 200;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status,
      ok: init.ok ?? (status >= 200 && status < 300),
      json: () => Promise.resolve(body),
    }),
  );
}

const fakeUser = {
  id: "user-1",
  tenantId: "tenant-1",
  name: "Owner",
  email: "owner@example.com",
  role: "OWNER",
  mfaEnabled: false,
};

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envia o header Authorization quando um token é passado", async () => {
    mockFetchResponse({ ok: true });

    await apiFetch("/carriers", { token: "abc123" });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/carriers"),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer abc123" }),
      }),
    );
  });

  it("monta a querystring a partir de query params, ignorando undefined", async () => {
    mockFetchResponse({ ok: true });

    await apiFetch("/carriers", {
      query: { name: "Azul", active: true, city: undefined },
    });

    const calledUrl = vi.mocked(fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain("name=Azul");
    expect(calledUrl).toContain("active=true");
    expect(calledUrl).not.toContain("city");
  });

  it("retorna undefined em respostas 204", async () => {
    mockFetchResponse(null, { status: 204 });

    const result = await apiFetch("/carriers/1");

    expect(result).toBeUndefined();
  });

  it("lança ApiError com status e mensagem do body em respostas de erro", async () => {
    mockFetchResponse(
      { message: "Transportadora não encontrada" },
      { status: 404, ok: false },
    );

    await expect(apiFetch("/carriers/inexistente")).rejects.toMatchObject({
      message: "Transportadora não encontrada",
      status: 404,
    });
  });

  it("usa mensagem genérica quando o body de erro não tem 'message'", async () => {
    mockFetchResponse({}, { status: 500, ok: false });

    await expect(apiFetch("/carriers")).rejects.toBeInstanceOf(ApiError);
    await expect(apiFetch("/carriers")).rejects.toMatchObject({
      message: "Erro inesperado ao comunicar com a API",
    });
  });
});

describe("apiFetch — renovação de token em respostas 401", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("renova o access token e repete a chamada original após um 401", async () => {
    setSession({
      user: fakeUser,
      accessToken: "expired-token",
      refreshToken: "refresh-token-1",
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/auth/refresh")) {
        expect(JSON.parse(init?.body as string)).toEqual({
          refreshToken: "refresh-token-1",
        });
        return jsonResponse(200, {
          accessToken: "new-token",
          refreshToken: "refresh-token-2",
        });
      }
      const authHeader = (init?.headers as Record<string, string>)
        .Authorization;
      if (authHeader === "Bearer expired-token") {
        return jsonResponse(401, { message: "Unauthorized" });
      }
      if (authHeader === "Bearer new-token") {
        return jsonResponse(200, { ok: true });
      }
      throw new Error(`unexpected call: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await apiFetch<{ ok: boolean }>("/dashboard/metrics", {
      token: "expired-token",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSnapshot()?.accessToken).toBe("new-token");
  });

  it("limpa a sessão e propaga o 401 quando o refresh token também é inválido", async () => {
    setSession({
      user: fakeUser,
      accessToken: "expired-token",
      refreshToken: "revoked-refresh-token",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/auth/refresh")) {
          return jsonResponse(401, { message: "Refresh token inválido" });
        }
        return jsonResponse(401, { message: "Unauthorized" });
      }),
    );

    await expect(
      apiFetch("/dashboard/metrics", { token: "expired-token" }),
    ).rejects.toMatchObject({ status: 401 });
    expect(getSnapshot()).toBeNull();
  });

  it("não tenta renovar quando a chamada é anônima (sem token)", async () => {
    mockFetchResponse({ message: "Unauthorized" }, { status: 401, ok: false });

    await expect(apiFetch("/dashboard/metrics")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("compartilha um único refresh entre chamadas 401 concorrentes", async () => {
    setSession({
      user: fakeUser,
      accessToken: "expired-token",
      refreshToken: "refresh-token-1",
    });

    let refreshCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/auth/refresh")) {
          refreshCalls += 1;
          return jsonResponse(200, {
            accessToken: "new-token",
            refreshToken: "refresh-token-2",
          });
        }
        const authHeader = (init?.headers as Record<string, string>)
          .Authorization;
        if (authHeader === "Bearer expired-token") {
          return jsonResponse(401, { message: "Unauthorized" });
        }
        return jsonResponse(200, { ok: true });
      }),
    );

    const [first, second] = await Promise.all([
      apiFetch<{ ok: boolean }>("/dashboard/metrics", {
        token: "expired-token",
      }),
      apiFetch<{ ok: boolean }>("/freight-quotes", {
        token: "expired-token",
      }),
    ]);

    expect(first).toEqual({ ok: true });
    expect(second).toEqual({ ok: true });
    expect(refreshCalls).toBe(1);
  });
});
