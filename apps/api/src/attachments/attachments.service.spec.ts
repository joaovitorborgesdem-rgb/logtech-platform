import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { AttachmentEntityType, AuditAction, UserRole } from "@prisma/client";
import { TenantScopedPrismaClient } from "../prisma/tenant-scoped-prisma.provider";
import { StorageService } from "../storage/storage.service";
import * as tenantContext from "../tenant/tenant-context";
import { AttachmentsService, UploadedFileLike } from "./attachments.service";

describe("AttachmentsService", () => {
  let service: AttachmentsService;
  let prisma: {
    attachment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    carrier: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    freightQuote: { findFirst: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let storageService: {
    upload: jest.Mock;
    delete: jest.Mock;
    getSignedDownloadUrl: jest.Mock;
  };
  let getTenantContextSpy: jest.SpyInstance;

  const baseAttachment = {
    id: "attachment-1",
    tenantId: "tenant-1",
    entityType: AttachmentEntityType.CARRIER,
    entityId: "carrier-1",
    storageKey: "tenant-1/CARRIER/carrier-1/uuid-file.pdf",
    originalName: "file.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    uploadedByUserId: "user-1",
    createdAt: new Date(),
    deletedAt: null,
  };

  const file: UploadedFileLike = {
    originalname: "file.pdf",
    mimetype: "application/pdf",
    size: 1024,
    buffer: Buffer.from("conteudo"),
  };

  beforeEach(() => {
    prisma = {
      attachment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      carrier: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      freightQuote: { findFirst: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    storageService = {
      upload: jest.fn(),
      delete: jest.fn(),
      getSignedDownloadUrl: jest.fn(),
    };

    getTenantContextSpy = jest
      .spyOn(tenantContext, "getTenantContext")
      .mockReturnValue({
        tenantId: "tenant-1",
        userId: "user-1",
        role: UserRole.MEMBER,
      });

    service = new AttachmentsService(
      prisma as unknown as TenantScopedPrismaClient,
      storageService as unknown as StorageService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    getTenantContextSpy.mockRestore();
  });

  describe("create", () => {
    it("lança BadRequestException quando nenhum arquivo é enviado", async () => {
      await expect(
        service.create(
          { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
          undefined,
          "user-1",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lança BadRequestException para tipo de arquivo não permitido", async () => {
      await expect(
        service.create(
          { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
          { ...file, mimetype: "application/x-executable" },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lança BadRequestException para arquivo acima do limite", async () => {
      await expect(
        service.create(
          { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
          { ...file, size: 20 * 1024 * 1024 },
          "user-1",
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("lança NotFoundException quando a entidade vinculada não existe", async () => {
      prisma.carrier.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
          file,
          "user-1",
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storageService.upload).not.toHaveBeenCalled();
    });

    it("lança InternalServerErrorException quando não há contexto de tenant", async () => {
      prisma.carrier.findFirst.mockResolvedValue({ id: "carrier-1" });
      getTenantContextSpy.mockReturnValue(undefined);

      await expect(
        service.create(
          { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
          file,
          "user-1",
        ),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it("faz upload e cria o registro do anexo", async () => {
      prisma.carrier.findFirst.mockResolvedValue({ id: "carrier-1" });
      prisma.attachment.create.mockResolvedValue(baseAttachment);

      const result = await service.create(
        { entityType: AttachmentEntityType.CARRIER, entityId: "carrier-1" },
        file,
        "user-1",
      );

      expect(result).toEqual(baseAttachment);
      const [key, buffer, contentType] = storageService.upload.mock
        .calls[0] as [string, Buffer, string];
      expect(key).toMatch(/^tenant-1\/CARRIER\/carrier-1\/.+-file\.pdf$/);
      expect(buffer).toBe(file.buffer);
      expect(contentType).toBe("application/pdf");

      const [createCall] = prisma.attachment.create.mock.calls as Array<
        [{ data: { uploadedByUserId: string; originalName: string } }]
      >;
      expect(createCall[0].data.uploadedByUserId).toBe("user-1");
      expect(createCall[0].data.originalName).toBe("file.pdf");
    });
  });

  describe("findAll", () => {
    it("lista anexos filtrando por entidade e registros removidos", async () => {
      prisma.attachment.findMany.mockResolvedValue([baseAttachment]);

      const result = await service.findAll({
        entityType: AttachmentEntityType.CARRIER,
        entityId: "carrier-1",
      });

      expect(result).toEqual([baseAttachment]);
      expect(prisma.attachment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            entityType: AttachmentEntityType.CARRIER,
            entityId: "carrier-1",
            deletedAt: null,
          },
        }),
      );
    });
  });

  describe("getDownloadUrl", () => {
    it("retorna a URL assinada para o anexo", async () => {
      prisma.attachment.findFirst.mockResolvedValue(baseAttachment);
      storageService.getSignedDownloadUrl.mockResolvedValue(
        "https://minio.local/signed",
      );

      const result = await service.getDownloadUrl("attachment-1");

      expect(result).toEqual({
        url: "https://minio.local/signed",
        expiresInSeconds: 300,
      });
      expect(storageService.getSignedDownloadUrl).toHaveBeenCalledWith(
        baseAttachment.storageKey,
        300,
      );
    });

    it("lança NotFoundException quando o anexo não existe", async () => {
      prisma.attachment.findFirst.mockResolvedValue(null);

      await expect(
        service.getDownloadUrl("inexistente"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("marca deletedAt, remove do storage e registra auditoria", async () => {
      prisma.attachment.findFirst.mockResolvedValue(baseAttachment);
      prisma.attachment.update.mockResolvedValue({
        ...baseAttachment,
        deletedAt: new Date(),
      });

      await service.remove("attachment-1", "user-1");

      const [updateCall] = prisma.attachment.update.mock.calls as Array<
        [{ where: { id: string }; data: { deletedAt: Date } }]
      >;
      expect(updateCall[0].where).toEqual({ id: "attachment-1" });
      expect(updateCall[0].data.deletedAt).toBeInstanceOf(Date);
      expect(storageService.delete).toHaveBeenCalledWith(
        baseAttachment.storageKey,
      );
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          action: AuditAction.ATTACHMENT_DELETED,
          metadata: {
            attachmentId: "attachment-1",
            entityType: baseAttachment.entityType,
            entityId: baseAttachment.entityId,
          },
        },
      });
    });

    it("lança NotFoundException ao remover anexo inexistente", async () => {
      prisma.attachment.findFirst.mockResolvedValue(null);

      await expect(
        service.remove("inexistente", "user-1"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storageService.delete).not.toHaveBeenCalled();
    });
  });
});
