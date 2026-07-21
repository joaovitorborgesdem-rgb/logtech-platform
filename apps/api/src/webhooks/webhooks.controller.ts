import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { CarrierWebhookEventDto } from "./dto/carrier-webhook-event.dto";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("carriers/:tenantSlug")
  @HttpCode(HttpStatus.ACCEPTED)
  async handleCarrierEvent(
    @Param("tenantSlug") tenantSlug: string,
    @Headers("x-webhook-signature") signature: string | undefined,
    @Body() body: CarrierWebhookEventDto,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new UnauthorizedException("Assinatura do webhook ausente");
    }
    if (!request.rawBody) {
      throw new UnauthorizedException(
        "Corpo da requisição indisponível para verificação",
      );
    }

    await this.webhooksService.handleCarrierEvent(
      tenantSlug,
      signature,
      request.rawBody,
      body,
    );

    return { received: true };
  }
}
