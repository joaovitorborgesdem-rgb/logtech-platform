import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { registerAndLogin } from "../support/auth-fixture";
import { resetDatabase } from "../support/reset-database";
import { createTestApp, TestApp } from "../support/test-app";

describe("Multi-tenancy (e2e)", () => {
  let testApp: TestApp;
  let app: INestApplication;

  beforeAll(async () => {
    testApp = await createTestApp();
    app = testApp.app;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  it("isola dados entre tenants através de toda a stack HTTP (TenantContextInterceptor + TENANT_SCOPED_PRISMA)", async () => {
    const tenantA = await registerAndLogin(app);
    const tenantB = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post("/carriers")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .send({
        name: "Transportadora do Tenant A",
        document: "11111111111111",
        active: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/clients")
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .send({
        name: "Cliente do Tenant B",
        email: "cliente-b@example.com",
        document: "22222222222222",
      })
      .expect(201);

    const carriersForB = await request(app.getHttpServer())
      .get("/carriers")
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(200);
    expect((carriersForB.body as { data: unknown[] }).data).toHaveLength(0);

    const clientsForA = await request(app.getHttpServer())
      .get("/clients")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect((clientsForA.body as { data: unknown[] }).data).toHaveLength(0);

    const meAsA = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .expect(200);
    expect((meAsA.body as { tenantId: string }).tenantId).toBe(
      tenantA.user.tenantId,
    );
    expect((meAsA.body as { tenantId: string }).tenantId).not.toBe(
      tenantB.user.tenantId,
    );
  });

  it("não permite registrar dois tenants com o mesmo slug", async () => {
    const tenantA = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        tenantName: "Outro Nome",
        tenantSlug: tenantA.tenantSlug,
        name: "Outro Owner",
        email: "outro@example.com",
        password: "supersecret123",
      })
      .expect(409);
  });
});
