import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { registerAndLogin } from "../support/auth-fixture";
import { resetDatabase } from "../support/reset-database";
import { createTestApp, TestApp } from "../support/test-app";

describe("Clients (integration)", () => {
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

  const clientPayload = {
    name: "Cliente Exemplo",
    email: "cliente@example.com",
    document: "98765432109876",
    city: "Curitiba",
    state: "PR",
  };

  it("cria, lista, busca, atualiza e remove um cliente", async () => {
    const { accessToken } = await registerAndLogin(app);

    const createRes = await request(app.getHttpServer())
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(clientPayload)
      .expect(201);
    const clientId = (createRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const updateRes = await request(app.getHttpServer())
      .patch(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ city: "Florianópolis" })
      .expect(200);
    expect((updateRes.body as { city: string }).city).toBe("Florianópolis");

    await request(app.getHttpServer())
      .delete(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(404);
  });

  it("rejeita e-mail inválido com 400", async () => {
    const { accessToken } = await registerAndLogin(app);

    await request(app.getHttpServer())
      .post("/clients")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ ...clientPayload, email: "não-é-email" })
      .expect(400);
  });

  it("não permite que um tenant veja cliente de outro tenant", async () => {
    const tenantA = await registerAndLogin(app);
    const tenantB = await registerAndLogin(app);

    const createRes = await request(app.getHttpServer())
      .post("/clients")
      .set("Authorization", `Bearer ${tenantA.accessToken}`)
      .send(clientPayload)
      .expect(201);
    const clientId = (createRes.body as { id: string }).id;

    const listRes = await request(app.getHttpServer())
      .get("/clients")
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(200);
    expect((listRes.body as { data: unknown[] }).data).toHaveLength(0);

    await request(app.getHttpServer())
      .get(`/clients/${clientId}`)
      .set("Authorization", `Bearer ${tenantB.accessToken}`)
      .expect(404);
  });
});
