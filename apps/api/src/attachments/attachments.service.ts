import { randomUUID } from "crypto";
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import {
  Attachment,
  AttachmentEntityType,
  AuditAction,
  Prisma,
} from "@prisma/client";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { StorageService } from "../storage/storage.service";
import { getTenantContext } from "../tenant/tenant-context";
import { AttachmentQueryDto } from "./dto/attachment-query.dto";
import { CreateAttachmentDto } from "./dto/create-attachment.dto";

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;
const DOWNLOAD_URL_EXPIRES_IN_SECONDS = 300;

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface SignedDownloadUrl {
  url: string;
  expiresInSeconds: number;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
    private readonly storageService: StorageService,
  ) {}

  async create(
    dto: CreateAttachmentDto,
    file: UploadedFileLike | undefined,
    userId: string,
  ): Promise<Attachment> {
    if (!file) {
      throw new BadRequestException("Nenhum arquivo enviado");
    }

    if (
      !ALLOWED_ATTACHMENT_MIME_TYPES.includes(
        file.mimetype as (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido: ${file.mimetype}`,
      );
    }

    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new BadRequestException(
        `Arquivo excede o tamanho máximo de ${
          MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024)
        }MB`,
      );
    }

    await this.assertEntityExists(dto.entityType, dto.entityId);

    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new InternalServerErrorException(
        "Contexto de tenant ausente ao enviar anexo",
      );
    }

    const storageKey = `${tenantContext.tenantId}/${dto.entityType}/${dto.entityId}/${randomUUID()}-${sanitizeFileName(file.originalname)}`;

    await this.storageService.upload(storageKey, file.buffer, file.mimetype);

    return this.prisma.attachment.create({
      data: {
        entityType: dto.entityType,
        entityId: dto.entityId,
        storageKey,
        originalName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedByUserId: userId,
      } as unknown as Prisma.AttachmentUncheckedCreateInput,
    });
  }

  async findAll(query: AttachmentQueryDto): Promise<Attachment[]> {
    return this.prisma.attachment.findMany({
      where: {
        entityType: query.entityType,
        entityId: query.entityId,
        deletedAt: null,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getDownloadUrl(id: string): Promise<SignedDownloadUrl> {
    const attachment = await this.findOne(id);
    const url = await this.storageService.getSignedDownloadUrl(
      attachment.storageKey,
      DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    );

    return { url, expiresInSeconds: DOWNLOAD_URL_EXPIRES_IN_SECONDS };
  }

  async remove(id: string, userId: string): Promise<void> {
    const attachment = await this.findOne(id);

    await this.prisma.attachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.storageService.delete(attachment.storageKey);

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.ATTACHMENT_DELETED,
        metadata: {
          attachmentId: id,
          entityType: attachment.entityType,
          entityId: attachment.entityId,
        },
      },
    });
  }

  private async findOne(id: string): Promise<Attachment> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id, deletedAt: null },
    });

    if (!attachment) {
      throw new NotFoundException("Anexo não encontrado");
    }

    return attachment;
  }

  private async assertEntityExists(
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<void> {
    let exists: unknown;

    switch (entityType) {
      case AttachmentEntityType.CARRIER:
        exists = await this.prisma.carrier.findFirst({
          where: { id: entityId, deletedAt: null },
        });
        break;
      case AttachmentEntityType.CLIENT:
        exists = await this.prisma.client.findFirst({
          where: { id: entityId, deletedAt: null },
        });
        break;
      case AttachmentEntityType.FREIGHT_QUOTE:
        exists = await this.prisma.freightQuote.findFirst({
          where: { id: entityId, deletedAt: null },
        });
        break;
    }

    if (!exists) {
      throw new NotFoundException("Entidade vinculada não encontrada");
    }
  }
}
