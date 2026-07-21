type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Circuit breaker simples em memória, por instância (uma por integração
 * externa, ver `ResilientHttpClient`). Abre depois de N falhas consecutivas
 * e volta a permitir uma tentativa (`HALF_OPEN`) após o cooldown — uma falha
 * nesse estado reabre o circuito, um sucesso o fecha.
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
  ) {}

  canAttempt(): boolean {
    if (this.state !== "OPEN") {
      return true;
    }

    if (
      this.openedAt !== null &&
      Date.now() - this.openedAt >= this.cooldownMs
    ) {
      this.state = "HALF_OPEN";
      return true;
    }

    return false;
  }

  onSuccess(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.openedAt = null;
  }

  onFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }
}
