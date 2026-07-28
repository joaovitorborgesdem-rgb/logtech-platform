import { ConflictException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  AuditAction,
  OAuthProvider,
  UserRole,
  UserStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { AuthResult, AuthService, MfaRequiredResult } from "./auth.service";
import { MfaService } from "./mfa.service";

jest.mock("bcrypt");

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    tenant: { findUnique: jest.Mock; create: jest.Mock };
    user: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    oAuthAccount: { findUnique: jest.Mock; create: jest.Mock };
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
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };
  let mfaService: {
    generateSecret: jest.Mock;
    buildOtpAuthUrl: jest.Mock;
    buildQrCodeDataUrl: jest.Mock;
    verifyToken: jest.Mock;
    generateBackupCodes: jest.Mock;
    consumeBackupCode: jest.Mock;
  };

  const baseUser = {
    id: "user-1",
    tenantId: "tenant-1",
    name: "Ana",
    email: "ana@example.com",
    passwordHash: "hashed-password",
    role: UserRole.OWNER,
    status: UserStatus.ACTIVE,
    mfaEnabled: false,
    mfaSecret: null,
    mfaBackupCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    prisma = {
      tenant: { findUnique: jest.fn(), create: jest.fn() },
      user: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      oAuthAccount: { findUnique: jest.fn(), create: jest.fn() },
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

    redis = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn(),
    };

    mfaService = {
      generateSecret: jest.fn().mockReturnValue("MFASECRET"),
      buildOtpAuthUrl: jest.fn().mockReturnValue("otpauth://totp/test"),
      buildQrCodeDataUrl: jest
        .fn()
        .mockResolvedValue("data:image/png;base64,abc"),
      verifyToken: jest.fn().mockReturnValue(false),
      generateBackupCodes: jest.fn().mockReturnValue({
        plainCodes: ["code1", "code2"],
        stored: [
          { codeHash: "hash1", usedAt: null },
          { codeHash: "hash2", usedAt: null },
        ],
      }),
      consumeBackupCode: jest.fn().mockReturnValue({
        valid: false,
        updatedCodes: [],
      }),
    };

    const configService = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_ACCESS_SECRET: "access-secret",
          JWT_REFRESH_SECRET: "refresh-secret",
          JWT_ACCESS_EXPIRES_IN: "15m",
          JWT_REFRESH_EXPIRES_IN: "7d",
          MFA_ISSUER: "LogiSense",
        };
        return values[key];
      }),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      redis as unknown as RedisService,
      mfaService as unknown as MfaService,
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

      const result = (await service.login(
        {
          tenantSlug: "acme",
          email: "ana@example.com",
          password: "supersecret",
        },
        "203.0.113.10",
      )) as AuthResult;

      expect(result.user.id).toBe(baseUser.id);
      expect(lastAuditAction()).toBe(AuditAction.LOGIN_SUCCESS);
    });

    it("retorna mfaRequired quando o usuário tem MFA habilitado", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = (await service.login(
        {
          tenantSlug: "acme",
          email: "ana@example.com",
          password: "supersecret",
        },
        "203.0.113.10",
      )) as MfaRequiredResult;

      expect(result.mfaRequired).toBe(true);
      expect(result.mfaToken).toBe("signed-token");
    });

    it("rejeita quando o tenant não existe", async () => {
      prisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          {
            tenantSlug: "inexistente",
            email: "ana@example.com",
            password: "supersecret",
          },
          "203.0.113.10",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejeita e audita quando o usuário não existe", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login(
          {
            tenantSlug: "acme",
            email: "desconhecido@example.com",
            password: "supersecret",
          },
          "203.0.113.10",
        ),
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
        service.login(
          {
            tenantSlug: "acme",
            email: "ana@example.com",
            password: "senha-errada",
          },
          "203.0.113.10",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(lastAuditAction()).toBe(AuditAction.LOGIN_FAILED);
    });

    it("incrementa contadores de falha por IP e por e-mail a cada tentativa errada", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login(
          {
            tenantSlug: "acme",
            email: "ana@example.com",
            password: "senha-errada",
          },
          "203.0.113.10",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(redis.incr).toHaveBeenCalledWith(
        "auth:login-fail:ip:203.0.113.10",
      );
      expect(redis.incr).toHaveBeenCalledWith(
        "auth:login-fail:email:acme:ana@example.com",
      );
    });

    it("bloqueia com 429 quando o limite de tentativas por e-mail é excedido", async () => {
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key.includes("email") ? "5" : null),
      );

      await expect(
        service.login(
          {
            tenantSlug: "acme",
            email: "ana@example.com",
            password: "qualquer-coisa",
          },
          "203.0.113.10",
        ),
      ).rejects.toMatchObject({ status: 429 });

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it("bloqueia com 429 quando o limite de tentativas por IP é excedido", async () => {
      redis.get.mockImplementation((key: string) =>
        Promise.resolve(key.includes("ip") ? "5" : null),
      );

      await expect(
        service.login(
          {
            tenantSlug: "acme",
            email: "outra@example.com",
            password: "qualquer-coisa",
          },
          "203.0.113.10",
        ),
      ).rejects.toMatchObject({ status: 429 });

      expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
    });

    it("limpa os contadores de falha após login bem-sucedido", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.login(
        {
          tenantSlug: "acme",
          email: "ana@example.com",
          password: "supersecret",
        },
        "203.0.113.10",
      );

      expect(redis.del).toHaveBeenCalledWith(
        "auth:login-fail:ip:203.0.113.10",
        "auth:login-fail:email:acme:ana@example.com",
      );
    });

    it("rejeita quando a conta é apenas OAuth (sem passwordHash)", async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: "tenant-1",
        slug: "acme",
      });
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
      });

      await expect(
        service.login(
          {
            tenantSlug: "acme",
            email: "ana@example.com",
            password: "qualquer",
          },
          "203.0.113.10",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(lastAuditAction()).toBe(AuditAction.LOGIN_FAILED);
    });
  });

  describe("handleOAuthLogin", () => {
    const profile = {
      provider: OAuthProvider.GOOGLE,
      providerAccountId: "google-123",
      email: "nova@example.com",
      name: "Nova Usuária",
    };

    it("reaproveita usuário existente vinculado à conta OAuth", async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({
        user: baseUser,
      });

      const result = (await service.handleOAuthLogin(profile)) as AuthResult;

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(result.user.id).toBe(baseUser.id);
      expect(lastAuditAction()).toBe(AuditAction.OAUTH_LOGIN);
    });

    it("cria tenant + usuário owner no primeiro acesso via OAuth", async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue(null);
      const createdUser = {
        ...baseUser,
        id: "user-2",
        email: profile.email,
        passwordHash: null,
      };
      prisma.tenant.create.mockResolvedValue({ id: "tenant-2" });
      prisma.user.create.mockResolvedValue(createdUser);
      prisma.oAuthAccount.create.mockResolvedValue({});

      type TxCallback = (tx: {
        tenant: { create: typeof prisma.tenant.create };
        user: { create: typeof prisma.user.create };
        oAuthAccount: { create: typeof prisma.oAuthAccount.create };
      }) => Promise<typeof createdUser>;
      prisma.$transaction.mockImplementation((callback: TxCallback) =>
        callback({
          tenant: { create: prisma.tenant.create },
          user: { create: prisma.user.create },
          oAuthAccount: { create: prisma.oAuthAccount.create },
        }),
      );

      const result = (await service.handleOAuthLogin(profile)) as AuthResult;

      const tenantCalls = prisma.tenant.create.mock.calls as Array<
        [{ data: { name: string } }]
      >;
      expect(tenantCalls[0][0].data.name).toBe(profile.name);

      const oauthAccountCalls = prisma.oAuthAccount.create.mock.calls as Array<
        [{ data: { provider: string; providerAccountId: string } }]
      >;
      expect(oauthAccountCalls[0][0].data.provider).toBe(profile.provider);
      expect(oauthAccountCalls[0][0].data.providerAccountId).toBe(
        profile.providerAccountId,
      );
      expect(result.user.email).toBe(profile.email);
      expect(lastAuditAction()).toBe(AuditAction.OAUTH_LOGIN);
    });

    it("rejeita quando o usuário vinculado está inativo", async () => {
      prisma.oAuthAccount.findUnique.mockResolvedValue({
        user: { ...baseUser, status: UserStatus.DISABLED },
      });

      await expect(service.handleOAuthLogin(profile)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("troca de código OAuth (Redis)", () => {
    it("cria e consome um código de troca uma única vez", async () => {
      const outcome: AuthResult = {
        accessToken: "a",
        refreshToken: "b",
        user: {
          id: baseUser.id,
          tenantId: baseUser.tenantId,
          name: baseUser.name,
          email: baseUser.email,
          role: baseUser.role,
          mfaEnabled: baseUser.mfaEnabled,
        },
      };

      const code = await service.createOAuthExchangeCode(outcome);
      expect(redis.set).toHaveBeenCalledWith(
        expect.stringContaining("oauth-exchange:"),
        JSON.stringify(outcome),
        "EX",
        60,
      );

      redis.get.mockResolvedValue(JSON.stringify(outcome));
      const consumed = await service.consumeOAuthExchangeCode(code);
      expect(consumed).toEqual(outcome);
      expect(redis.del).toHaveBeenCalled();
    });

    it("rejeita um código inexistente ou expirado", async () => {
      redis.get.mockResolvedValue(null);

      await expect(
        service.consumeOAuthExchangeCode("invalido"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("verifyMfa", () => {
    const mfaPayload = { sub: baseUser.id, type: "mfa" as const };

    it("emite tokens quando o TOTP é válido", async () => {
      jwtService.verifyAsync.mockResolvedValue(mfaPayload);
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
      });
      mfaService.verifyToken.mockReturnValue(true);

      const result = await service.verifyMfa("mfa-token", "123456");

      expect(result.user.id).toBe(baseUser.id);
      expect(lastAuditAction()).toBe(AuditAction.LOGIN_SUCCESS);
    });

    it("aceita um código de backup válido quando o TOTP falha", async () => {
      jwtService.verifyAsync.mockResolvedValue(mfaPayload);
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
        mfaBackupCodes: [{ codeHash: "hash1", usedAt: null }],
      });
      mfaService.verifyToken.mockReturnValue(false);
      mfaService.consumeBackupCode.mockReturnValue({
        valid: true,
        updatedCodes: [{ codeHash: "hash1", usedAt: new Date().toISOString() }],
      });

      const result = await service.verifyMfa("mfa-token", "backup-code");

      expect(result.user.id).toBe(baseUser.id);
      expect(prisma.user.update).toHaveBeenCalled();
      expect(lastAuditAction()).toBe(AuditAction.LOGIN_SUCCESS);
    });

    it("rejeita e audita quando TOTP e backup code são inválidos", async () => {
      jwtService.verifyAsync.mockResolvedValue(mfaPayload);
      prisma.user.findUnique.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
      });
      mfaService.verifyToken.mockReturnValue(false);
      mfaService.consumeBackupCode.mockReturnValue({
        valid: false,
        updatedCodes: [],
      });

      await expect(
        service.verifyMfa("mfa-token", "000000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(lastAuditAction()).toBe(AuditAction.MFA_VERIFY_FAILED);
    });

    it("rejeita quando o mfaToken é inválido", async () => {
      jwtService.verifyAsync.mockRejectedValue(new Error("bad token"));

      await expect(
        service.verifyMfa("token-invalido", "123456"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe("setupMfa / enableMfa / disableMfa", () => {
    it("gera secret + otpauth url + QR code no setup", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue(baseUser);

      const result = await service.setupMfa(baseUser.id);

      expect(result.secret).toBe("MFASECRET");
      expect(result.qrCodeDataUrl).toContain("data:image/png;base64");
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { mfaSecret: "MFASECRET" },
        }),
      );
    });

    it("habilita MFA e retorna backup codes quando o código é válido", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        mfaSecret: "MFASECRET",
      });
      mfaService.verifyToken.mockReturnValue(true);

      const result = await service.enableMfa(baseUser.id, "123456");

      expect(result.backupCodes).toEqual(["code1", "code2"]);
      expect(lastAuditAction()).toBe(AuditAction.MFA_ENABLED);
    });

    it("rejeita habilitar MFA com código inválido", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        mfaSecret: "MFASECRET",
      });
      mfaService.verifyToken.mockReturnValue(false);

      await expect(
        service.enableMfa(baseUser.id, "000000"),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("desabilita MFA com senha correta", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await service.disableMfa(baseUser.id, { password: "supersecret" });

      const updateCalls = prisma.user.update.mock.calls as Array<
        [{ data: { mfaEnabled: boolean; mfaSecret: string | null } }]
      >;
      expect(updateCalls[0][0].data.mfaEnabled).toBe(false);
      expect(updateCalls[0][0].data.mfaSecret).toBeNull();
      expect(lastAuditAction()).toBe(AuditAction.MFA_DISABLED);
    });

    it("desabilita MFA com TOTP válido quando não há senha (conta OAuth)", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        passwordHash: null,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
      });
      mfaService.verifyToken.mockReturnValue(true);

      await service.disableMfa(baseUser.id, { code: "123456" });

      expect(lastAuditAction()).toBe(AuditAction.MFA_DISABLED);
    });

    it("rejeita desabilitar MFA sem senha nem código válidos", async () => {
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        ...baseUser,
        mfaEnabled: true,
        mfaSecret: "MFASECRET",
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      mfaService.verifyToken.mockReturnValue(false);

      await expect(
        service.disableMfa(baseUser.id, { password: "errada" }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
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
