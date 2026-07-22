import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { registerAndLogin } from "../support/auth-fixture";
import { resetDatabase } from "../support/reset-database";
import { createTestApp, TestApp } from "../support/test-app";

describe("Auth (e2e)", () => {
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

  it("cobre o fluxo completo: register -> login -> rota protegida -> refresh -> logout -> refresh token revogado", async () => {
    const registered = await registerAndLogin(app);

    const loginRes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        tenantSlug: registered.tenantSlug,
        email: registered.email,
        password: registered.password,
      })
      .expect(200);
    const login = loginRes.body as {
      accessToken: string;
      refreshToken: string;
    };

    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.accessToken}`)
      .expect(200);
    expect((meRes.body as { tenantId: string }).tenantId).toBe(
      registered.user.tenantId,
    );

    const refreshRes = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.refreshToken })
      .expect(200);
    const refreshed = refreshRes.body as {
      accessToken: string;
      refreshToken: string;
    };
    // O refresh token tem um `jti` aleatório e é sempre único; o access
    // token pode coincidir byte a byte se emitido no mesmo segundo (mesmo
    // payload + `iat`), então não é uma asserção confiável aqui.
    expect(refreshed.refreshToken).not.toBe(login.refreshToken);

    // O refresh token antigo já foi revogado ao ser usado.
    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: login.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post("/auth/logout")
      .set("Authorization", `Bearer ${refreshed.accessToken}`)
      .send({ refreshToken: refreshed.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: refreshed.refreshToken })
      .expect(401);
  });

  it("rejeita login com senha incorreta", async () => {
    const registered = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        tenantSlug: registered.tenantSlug,
        email: registered.email,
        password: "senha-errada",
      })
      .expect(401);
  });

  it("rejeita acesso a rota protegida sem token", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });
});
