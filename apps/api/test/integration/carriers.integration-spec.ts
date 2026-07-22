import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { registerAndLogin } from "../support/auth-fixture";
import { resetDatabase } from "../support/reset-database";
import { createTestApp, TestApp } from "../support/test-app";

describe("Carriers (integration)", () => {
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

  const carrierPayload = {
    name: "Transportadora Azul",
    document: "12345678901234",
    email: "contato@azul.example.com",
    city: "São Paulo",
    state: "SP",
    active: true,
  };

  it("cria, lista, busca, atualiza e remove uma transportadora", async () => {
    const { accessToken } = await registerAndLogin(app);

    const createRes = await request(app.getHttpServer())
      .post("/carriers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(carrierPayload)
      .expect(201);

    const carrierId = (createRes.body as { id: string }).id;
    expect((createRes.body as { name: string }).name).toBe(carrierPayload.name);

    const listRes = await request(app.getHttpServer())
      .get("/carriers")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect((listRes.body as { data: unknown[] }).data).toHaveLength(1);

    const getRes = await request(app.getHttpServer())
      .get(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);
    expect((getRes.body as { id: string }).id).toBe(carrierId);

    const updateRes = await request(app.getHttpServer())
      .patch(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ city: "Rio de Janeiro" })
      .expect(200);
    expect((updateRes.body as { city: string }).city).toBe("Rio de Janeiro");

    await request(app.getHttpServer())
      .delete(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);
  });

  it("rejeita payload inválido com 400", async () => {
    const { accessToken } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post("/carriers")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ name: "A" })
      .expect(400);
  });

  it("exige autenticação", async () => {
    await request(app.getHttpServer()).get("/carriers").expect(401);
  });

  it("não permite que um tenant veja/edite transportadora de outro tenant", async () => {
    const tenantA = await registerAndLogin(app);
    const tenantB = await registerAndLogin(app);

    const createRes = await request(app.getHttpServer())
      .post("/carriers")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .send(carrierPayload)
      .expect(201);
    const carrierId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get("/carriers")
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(200);
    expect((listRes.body as { data: unknown[] }).data).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .patch(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .send({ city: "Curitiba" })
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/carriers/${carrierId}`)
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(404);
  });
});
