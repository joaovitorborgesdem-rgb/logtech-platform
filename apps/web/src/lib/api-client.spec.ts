import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api-client";

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
