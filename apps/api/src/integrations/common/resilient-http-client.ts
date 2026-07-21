import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { CircuitBreaker } from "./circuit-breaker";
import { RateLimiter } from "./rate-limiter";

export interface ResilientFetchOptions {
  /** Nome da integração — chave dos limiters/breakers, aparece nos logs e erros. */
  integrationName: string;
  timeoutMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  minIntervalMs?: number;
  failureThreshold?: number;
  cooldownMs?: number;
}

const DEFAULTS = {
  timeoutMs: 5000,
  maxAttempts: 3,
  baseDelayMs: 150,
  minIntervalMs: 100,
  failureThreshold: 5,
  cooldownMs: 30_000,
};

/**
 * Algumas APIs públicas (ex.: BrasilAPI) bloqueiam requisições sem
 * `User-Agent` reconhecível como bot/scraper genérico — identificar o
 * cliente é tanto boa prática quanto necessário na prática.
 */
const USER_AGENT = "LogiSense/1.0 (+https://logisense.app)";

/**
 * Cliente HTTP genérico para integrações externas (ver ADR-010): timeout +
 * retry com backoff exponencial para falhas transitórias/5xx, rate limiting
 * por integração e circuit breaker para parar de bater numa API que está
 * fora do ar. Reutilizado por ViaCEP e CNPJ (BrasilAPI) — qualquer nova
 * integração HTTP deve passar por aqui em vez de chamar `fetch` direto.
 *
 * 4xx não é retryable (a requisição está errada, tentar de novo não muda o
 * resultado) e não conta como falha do circuito — a API respondeu, só não
 * gostou da requisição.
 */
@Injectable()
export class ResilientHttpClient {
  private readonly logger = new Logger(ResilientHttpClient.name);
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly limiters = new Map<string, RateLimiter>();

  async fetchJson<T>(url: string, options: ResilientFetchOptions): Promise<T> {
    const config = { ...DEFAULTS, ...options };
    const breaker = this.getBreaker(config);
    const limiter = this.getLimiter(config);

    if (!breaker.canAttempt()) {
      throw new ServiceUnavailableException(
        `Integração ${config.integrationName} temporariamente indisponível (circuit breaker aberto)`,
      );
    }

    let lastError: unknown;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      await limiter.acquire();

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT },
        });

        if (response.ok) {
          breaker.onSuccess();
          return (await response.json()) as T;
        }

        if (response.status >= 400 && response.status < 500) {
          breaker.onSuccess();
          throw new ClientRequestError(config.integrationName, response.status);
        }

        lastError = new Error(
          `Resposta ${response.status} de ${config.integrationName}`,
        );
      } catch (error) {
        if (error instanceof ClientRequestError) {
          throw error;
        }
        lastError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (attempt < config.maxAttempts) {
        const delay = config.baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    breaker.onFailure();
    this.logger.error(
      `Falha ao consultar ${config.integrationName} após ${config.maxAttempts} tentativa(s)`,
      lastError as Error,
    );
    throw new ServiceUnavailableException(
      `Falha ao consultar ${config.integrationName}`,
    );
  }

  private getBreaker(config: Required<ResilientFetchOptions>): CircuitBreaker {
    const existing = this.breakers.get(config.integrationName);
    if (existing) {
      return existing;
    }
    const breaker = new CircuitBreaker(
      config.failureThreshold,
      config.cooldownMs,
    );
    this.breakers.set(config.integrationName, breaker);
    return breaker;
  }

  private getLimiter(config: Required<ResilientFetchOptions>): RateLimiter {
    const existing = this.limiters.get(config.integrationName);
    if (existing) {
      return existing;
    }
    const limiter = new RateLimiter(config.minIntervalMs);
    this.limiters.set(config.integrationName, limiter);
    return limiter;
  }
}

export class ClientRequestError extends Error {
  constructor(
    public readonly integrationName: string,
    public readonly status: number,
  ) {
    super(`Requisição inválida para ${integrationName}: HTTP ${status}`);
  }
}
