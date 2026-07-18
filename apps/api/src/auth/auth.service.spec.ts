import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { AuditAction, UserRole, UserStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";

jest.mock("bcrypt");

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    tenant: { findUnique: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    auditLog: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
    decode: jest.Mock;
  };

  const baseUser = {
    id: "user-1",
    tenantId: "tenant-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "hashed-password",
    role: UserRole.OWNER,
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue("signed-token"),
      verifyAsync: jest.fn(),
      decode: jest.fn().mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    };

    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_SECRET: "access-secret",
          JWT_REFRESH_SECRET: "refresh-secret",
          JWT_ACCESS_EXPIRES_IN: "15m",
          JWT_REFRESH_EXPIRES_IN: "7d",
        };
        return values[key];
      }),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );

    prisma.refreshToken.create.mockResolvedValue({ id: "refresh-row-1" });
    prisma.auditLog.create.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function lastAuditAction(): AuditAction | undefined {
    const calls = prisma.auditLog.create.mock.calls as Array<
      [{ data: { action: AuditAction } }]
    >;
    return calls.at(-1)?.[0].data.action;
  }

  describe("register", () => {
    it("cria tenant + usuário owner e retorna tokens", async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);
      prisma.tenant.create.mockResolvedValue({ id: "tenant-1" });
      prisma.user.create.mockResolvedValue(baseUser);
      type TxCallback = (tx: {
        tenant: { create: typeof prisma.tenant.create };
        user: { create: typeof prisma.user.create };
      }) => Promise<typeof baseUser>;
      prisma.$transaction.mockImplementation((callback: TxCallback) =>
        callback({
          tenant: { create: prisma.tenant.create },
          user: { create: prisma.user.create },
        }),
      );
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashed-password");

      const result = await service.register({
        tenantName: "Acme",
        tenantSlug: "acme",
        name: "Ana",
        email: "ana@example.com",
        password: "supersecret",
      });

      expect(result.user.email).toBe("ana@example.com");
      expect(result.accessToken).toBe("signed-token");
      expect(result.refreshToken).toBe("signed-token");
      expect(lastAuditAction()).toBe(AuditAction.REGISTER);
    });

    it("lança ConflictException se o tenantSlug já existir", async () => {
      prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });

      await expect(
        service.register({
          tenantName: "Acme",
          tenantSlug: "acme",
          name: "Ana",
          email: "ana@example.com",
          password: "supersecret",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("login", () => {
    it("autentica com credenciais válidas", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        tenantSlug: "acme",
        email: "ana@example.com",
        password: "supersecret",
      });

      expect(result.user.id).toBe(baseUser.id);
      expect(lastAuditAction()).toBe(AuditAction.LOGIN_SUCCESS);
    });

    it("rejeita quando o tenant não existe", async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          tenantSlug: "inexistente",
          email: "ana@example.com",
          password: "supersecret",
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejeita e audita quando o usuário não existe", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({
          tenantSlug: "acme",
          email: "desconhecido@example.com",
          password: "supersecret",
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(lastAuditAction()).toBe(AuditAction.LOGIN_FAILED);
    });

    it("rejeita e audita quando a senha está incorreta", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          tenantSlug: "acme",
          email: "ana@example.com",
          password: "senha-errada",
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(lastAuditAction()).toBe(AuditAction.LOGIN_FAILED);
    });
  });

  describe("refresh", () => {
    const validPayload = {
      sub: baseUser.id,
      tenantId: baseUser.tenantId,
      jti: "jti-1",
      type: "refresh" as const,
    };

    it("rotaciona o refresh token válido e emite novos tokens", async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "refresh-row-1",
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);

      const result = await service.refresh("valid-refresh-token");

      expect(result.accessToken).toBe("signed-token");
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "refresh-row-1" } }),
      );
    });

    it("rejeita quando a assinatura do token é inválida", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("invalid signature"));

      await expect(service.refresh("token-invalido")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("rejeita quando o token já foi revogado", async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "refresh-row-1",
        userId: baseUser.id,
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
      });

      await expect(service.refresh("revoked-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it("rejeita quando o token expirou no banco", async () => {
      jwtService.verifyAsync.mockResolvedValue(validPayload);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "refresh-row-1",
        userId: baseUser.id,
        revokedAt: null,
        expiresAt: new Date(Date.now() - 60_000),
      });

      await expect(service.refresh("expired-token")).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("logout", () => {
    it("revoga o refresh token do usuário autenticado", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "refresh-row-1",
        userId: baseUser.id,
        revokedAt: null,
      });

      await service.logout(baseUser.id, "refresh-token");

      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "refresh-row-1" } }),
      );
      expect(lastAuditAction()).toBe(AuditAction.LOGOUT);
    });

    it("não revoga token pertencente a outro usuário", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: "refresh-row-1",
        userId: "outro-usuario",
        revokedAt: null,
      });

      await service.logout(baseUser.id, "refresh-token");

      expect(prisma.refreshToken.update).not.toHaveBeenCalled();
    });
  });
});
