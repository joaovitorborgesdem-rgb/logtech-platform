import { IsDateString, IsIn, IsOptional, IsString } from "class-validator";

export const CARRIER_WEBHOOK_EVENT_TYPES = [
  "PICKED_UP",
  "IN_TRANSIT",
  "DELIVERED",
  "EXCEPTION",
] as const;

export type CarrierWebhookEventType =
  (typeof CARRIER_WEBHOOK_EVENT_TYPES)[number];

export class CarrierWebhookEventDto {
  @IsIn(CARRIER_WEBHOOK_EVENT_TYPES)
  eventType!: CarrierWebhookEventType;

  @IsString()
  carrierId!: string;

  @IsOptional()
  @IsString()
  freightQuoteId?: string;

  @IsOptional()
  @IsString()
  message?: string;

  @IsDateString()
  occurredAt!: string;
}
