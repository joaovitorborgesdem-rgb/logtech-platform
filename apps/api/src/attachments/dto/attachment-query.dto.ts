import { AttachmentEntityType } from "@prisma/client";
import { IsEnum, IsString } from "class-validator";

export class AttachmentQueryDto {
  @IsEnum(AttachmentEntityType)
  entityType!: AttachmentEntityType;

  @IsString()
  entityId!: string;
}
