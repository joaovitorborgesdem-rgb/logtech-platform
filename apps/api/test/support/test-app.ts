import "./load-test-env";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app.module";
import { PrismaService } from "../../src/prisma/prisma.service";

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
}

/**
 * Bootstrap de app completo para testes de integração/e2e — mesmo
 * `ValidationPipe` do `main.ts`, contra o banco de teste (`.env.test.local`
 * carregado por `load-test-env`, que roda antes do `ConfigModule` ler `.env`
 * — dotenv não sobrescreve vars já setadas).
 */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  // Sem isso, `app.close()` não dispara `onApplicationShutdown` nos
  // providers — as conexões BullMQ/ioredis ficam abertas e o processo do
  // Jest nunca termina sozinho no fim da suíte (mesmo comportamento de
  // `main.ts`).
  app.enableShutdownHooks();
  await app.init();

  const prisma = app.get(PrismaService);

  return { app, prisma };
}
