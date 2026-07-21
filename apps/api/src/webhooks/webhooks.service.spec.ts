import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { createHmac } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CarrierWebhookEventDto } from "./dto/carrier-webhook-event.dto";
import { WebhooksService } from "./webhooks.service";

describe("WebhooksService", () => {
  let service: WebhooksService;
  let prisma: {
    tenant: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
  };

  const secret = "tenant-webhook-secret";
  const payload: CarrierWebhookEventDto = {
    eventType: "DELIVERED",
    carrierId: "carrier-1",
    freightQuoteId: "quote-1",
    occurredAt: "2026-07-21T12:00:00.000Z",
  };
  const rawBody = Buffer.from(JSON.stringify(payload), "utf-8");

  function sign(body: Buffer, key: string): string {
    return createHmac("sha256", key).update(body).digest("hex");
  }

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    service = new WebhooksService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("registra o evento em AuditLog quando a assinatura é válida", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      slug: "acme",
      webhookSecret: secret,
    });

    await service.handleCarrierEvent(
      "acme",
      sign(rawBody, secret),
      rawBody,
      payload,
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        action: AuditAction.EXTERNAL_WEBHOOK_RECEIVED,
        description: "Evento de transportadora: DELIVERED",
        metadata: { ...payload },
      },
    });
  });

  it("lança NotFoundException quando o tenant não existe", async () => {
    prisma.tenant.findUnique.mockResolvedValue(null);

    await expect(
      service.handleCarrierEvent("inexistente", "assinatura", rawBody, payload),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("lança NotFoundException quando o tenant não tem webhookSecret configurado", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      slug: "acme",
      webhookSecret: null,
    });

    await expect(
      service.handleCarrierEvent("acme", "assinatura", rawBody, payload),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("lança UnauthorizedException quando a assinatura é inválida", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      slug: "acme",
      webhookSecret: secret,
    });

    await expect(
      service.handleCarrierEvent("acme", "assinatura-errada", rawBody, payload),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("lança UnauthorizedException quando a assinatura foi gerada com outro segredo", async () => {
    prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      slug: "acme",
      webhookSecret: secret,
    });

    await expect(
      service.handleCarrierEvent(
        "acme",
        sign(rawBody, "outro-segredo"),
        rawBody,
        payload,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
