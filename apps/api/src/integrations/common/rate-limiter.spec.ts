import { RateLimiter } from "./rate-limiter";

describe("RateLimiter", () => {
  it("não espera na primeira chamada", async () => {
    const limiter = new RateLimiter(1000);
    const start = Date.now();

    await limiter.acquire();

    expect(Date.now() - start).toBeLessThan(50);
  });

  it("espera o intervalo mínimo entre chamadas consecutivas", async () => {
    const limiter = new RateLimiter(100);

    await limiter.acquire();
    const start = Date.now();
    await limiter.acquire();

    expect(Date.now() - start).toBeGreaterThanOrEqual(90);
  });
});
