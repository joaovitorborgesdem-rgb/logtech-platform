import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { registerAndLogin } from "../support/auth-fixture";
import { resetDatabase } from "../support/reset-database";
import { createTestApp, TestApp } from "../support/test-app";

const POLL_INTERVAL_MS = 250;
const POLL_TIMEOUT_MS = 15_000;

interface FreightQuoteResponse {
  id: string;
  status: "PENDING" | "PROCESSING" | "DONE" | "ERROR";
  options: { id: string; carrierId: string; price: string }[];
}

async function waitForQuoteToFinish(
  app: INestApplication,
  accessToken: string,
  quoteId: string,
): Promise<FreightQuoteResponse> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await request(app.getHttpServer())
      .get(`/freight-quotes/${quoteId}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    const quote = res.body as FreightQuoteResponse;
    if (quote.status === "DONE" || quote.status === "ERROR") {
      return quote;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(
    `Cotação ${quoteId} não terminou de processar em ${POLL_TIMEOUT_MS}ms`,
  );
}

describe("Freight quotes (e2e, fila BullMQ + worker real)", () => {
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

  it(
    "cria uma cotação, processa via fila/worker reais e gera opções por transportadora ativa",
    async () => {
      const { accessToken } = await registerAndLogin(app);

      await request(app.getHttpServer())
        .post("/carriers")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          name: "Transportadora Rápida",
          document: "33333333333333",
          active: true,
          basePrice: 50,
          pricePerKg: 1.2,
          pricePerKm: 0.05,
          insuranceRate: 0.01,
          avgSpeedKmPerDay: 500,
          handlingDays: 1,
        })
        .expect(201);

      const createRes = await request(app.getHttpServer())
        .post("/freight-quotes")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({
          originZipCode: "01310-100",
          destinationZipCode: "20040-020",
          weightKg: 100,
          lengthCm: 50,
          widthCm: 40,
          heightCm: 30,
          cargoValue: 5000,
        })
        .expect(201);

      const quoteId = (createRes.body as { id: string }).id;

      const finished = await waitForQuoteToFinish(app, accessToken, quoteId);

      expect(finished.status).toBe("DONE");
      expect(finished.options).toHaveLength(1);
      expect(Number(finished.options[0].price)).toBeGreaterThan(0);
    },
    POLL_TIMEOUT_MS + 5_000,
  );
});
