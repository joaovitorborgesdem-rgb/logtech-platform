import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("permanece fechado enquanto o número de falhas não atinge o limite", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure();
    breaker.onFailure();

    expect(breaker.getState()).toBe("CLOSED");
    expect(breaker.canAttempt()).toBe(true);
  });

  it("abre depois de atingir o limite de falhas consecutivas", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure();
    breaker.onFailure();
    breaker.onFailure();

    expect(breaker.getState()).toBe("OPEN");
    expect(breaker.canAttempt()).toBe(false);
  });

  it("um sucesso zera o contador de falhas e fecha o circuito", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure();
    breaker.onFailure();
    breaker.onSuccess();
    breaker.onFailure();
    breaker.onFailure();

    expect(breaker.getState()).toBe("CLOSED");
  });

  it("permite uma nova tentativa (HALF_OPEN) após o cooldown", () => {
    jest.useFakeTimers().setSystemTime(0);
    const breaker = new CircuitBreaker(1, 1000);

    breaker.onFailure();
    expect(breaker.canAttempt()).toBe(false);

    jest.setSystemTime(1500);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.getState()).toBe("HALF_OPEN");
  });
});
