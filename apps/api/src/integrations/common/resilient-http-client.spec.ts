import { ServiceUnavailableException } from "@nestjs/common";
import { ResilientHttpClient } from "./resilient-http-client";

describe("ResilientHttpClient", () => {
  let client: ResilientHttpClient;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    client = new ResilientHttpClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("retorna o JSON quando a resposta é ok na primeira tentativa", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ foo: "bar" }),
    });

    const result = await client.fetchJson("http://example.com", {
      integrationName: "test-a",
      maxAttempts: 3,
      baseDelayMs: 1,
      minIntervalMs: 1,
    });

    expect(result).toEqual({ foo: "bar" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("faz retry em erro 5xx e tem sucesso numa tentativa seguinte", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      });

    const result = await client.fetchJson("http://example.com", {
      integrationName: "test-b",
      maxAttempts: 3,
      baseDelayMs: 1,
      minIntervalMs: 1,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("não faz retry em erro 4xx e lança imediatamente", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      client.fetchJson("http://example.com", {
        integrationName: "test-c",
        maxAttempts: 3,
        baseDelayMs: 1,
        minIntervalMs: 1,
      }),
    ).rejects.toThrow("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lança ServiceUnavailableException após esgotar as tentativas", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    await expect(
      client.fetchJson("http://example.com", {
        integrationName: "test-d",
        maxAttempts: 2,
        baseDelayMs: 1,
        minIntervalMs: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("abre o circuito após atingir o limite de falhas e passa a rejeitar sem chamar fetch", async () => {
    fetchMock.mockRejectedValue(new Error("network error"));

    const call = () =>
      client.fetchJson("http://example.com", {
        integrationName: "test-e",
        maxAttempts: 1,
        baseDelayMs: 1,
        minIntervalMs: 1,
        failureThreshold: 2,
        cooldownMs: 60_000,
      });

    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);

    fetchMock.mockClear();

    await expect(call()).rejects.toThrow("circuit breaker aberto");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
