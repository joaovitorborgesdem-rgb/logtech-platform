import "../test/support/load-test-env";
import { execSync } from "child_process";
import { Redis } from "ioredis";

/**
 * Roda antes de test:integration/test:e2e:
 * 1. Aplica as migrations (`migrate deploy`, não `dev`: não precisa de
 *    shadow database) contra o banco de teste apontado por `.env.test.local`
 *    local ou pelas env vars já setadas pelo CI.
 * 2. Limpa o Redis de teste (`REDIS_DB`, isolado do Redis de dev — ver
 *    ADR-014) — sem isso, jobs BullMQ de execuções anteriores (ex.: uma
 *    cotação de frete cujo registro já foi apagado pelo `resetDatabase` de
 *    um teste anterior) ficam acumulados na fila e atrasam/quebram o
 *    processamento dos jobs do run atual.
 */
async function main() {
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    cwd: `${__dirname}/..`,
    env: process.env,
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    db: Number(process.env.REDIS_DB ?? 0),
  });
  await redis.flushdb();
  await redis.quit();
}

void main();
