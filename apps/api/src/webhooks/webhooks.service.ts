import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { createHmac, timingSafeEqual } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { CarrierWebhookEventDto } from "./dto/carrier-webhook-event.dto";

/**
 * Recebe eventos de sistemas externos (ex.: transportadora) para um tenant
 * identificado pelo slug na URL. Não passa por `JwtAuthGuard` — quem chama é
 * um sistema externo sem sessão de usuário, então a autenticação é via
 * assinatura HMAC do corpo cru da requisição (ver ADR-010), não JWT.
 */
@Injectable()
export class WebhooksService {
  constructor(private readonly prisma: PrismaService) {}

  async handleCarrierEvent(
    tenantSlug: string,
    signature: string,
    rawBody: Buffer,
    payload: CarrierWebhookEventDto,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: tenantSlug },
    });

    if (!tenant || !tenant.webhookSecret) {
      throw new NotFoundException(
        "Tenant não encontrado ou webhooks não habilitados",
      );
    }

    if (!this.isValidSignature(rawBody, signature, tenant.webhookSecret)) {
      throw new UnauthorizedException("Assinatura do webhook inválida");
    }

    await this.prisma.auditLog.create({
      data: {
        tenantId: tenant.id,
        action: AuditAction.EXTERNAL_WEBHOOK_RECEIVED,
        description: `Evento de transportadora: ${payload.eventType}`,
        metadata: { ...payload },
      },
    });
  }

  private isValidSignature(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): boolean {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf-8");
    const providedBuffer = Buffer.from(signature, "utf-8");

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, providedBuffer);
  }
}
