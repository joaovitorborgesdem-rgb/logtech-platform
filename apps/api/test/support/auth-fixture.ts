import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import request from "supertest";

export interface RegisteredTenant {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: string;
  };
  tenantSlug: string;
  email: string;
  password: string;
}

/**
 * Registra um tenant+usuário OWNER via `POST /auth/register` de verdade
 * (em vez de mintar um JWT manualmente) — exercita o fluxo de auth real,
 * que é justamente um dos fluxos críticos desta fase.
 */
export async function registerAndLogin(
  app: INestApplication,
  overrides: Partial<{
    tenantName: string;
    tenantSlug: string;
    name: string;
    email: string;
    password: string;
  }> = {},
): Promise<RegisteredTenant> {
  const unique = randomUUID().slice(0, 8);
  const payload = {
    tenantName: overrides.tenantName ?? `Tenant ${unique}`,
    tenantSlug: overrides.tenantSlug ?? `tenant-${unique}`,
    name: overrides.name ?? "Owner Teste",
    email: overrides.email ?? `owner-${unique}@example.com`,
    password: overrides.password ?? "supersecret123",
  };

  const response = await request(app.getHttpServer())
    .post("/auth/register")
    .send(payload)
    .expect(201);

  const body = response.body as {
    accessToken: string;
    refreshToken: string;
    user: RegisteredTenant["user"];
  };

  return {
    ...body,
    tenantSlug: payload.tenantSlug,
    email: payload.email,
    password: payload.password,
  };
}
