/**
 * Limitador simples de taxa por intervalo mínimo entre chamadas, por
 * instância (uma por integração externa). Não é um token bucket completo —
 * apenas garante um espaçamento mínimo entre requisições sequenciais, o
 * suficiente para não sobrecarregar APIs públicas gratuitas (ViaCEP, BrasilAPI).
 */
export class RateLimiter {
  private lastRequestAt = 0;

  constructor(private readonly minIntervalMs: number) {}

  async acquire(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minIntervalMs) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.minIntervalMs - elapsed),
      );
    }
    this.lastRequestAt = Date.now();
  }
}
