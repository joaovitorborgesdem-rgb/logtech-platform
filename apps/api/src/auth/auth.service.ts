import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import {
  AuditAction,
  Prisma,
  User,
  UserRole,
  UserStatus,
} from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomBytes, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../redis/redis.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { MfaBackupCode } from "./interfaces/mfa-backup-code.interface";
import {
  AccessTokenPayload,
  MfaTokenPayload,
  RefreshTokenPayload,
} from "./interfaces/jwt-payload.interface";
import { NormalizedOAuthProfile } from "./interfaces/oauth-profile.interface";
import { MfaService } from "./mfa.service";

const BCRYPT_SALT_ROUNDS = 12;
const MFA_TOKEN_EXPIRES_IN = "5m";
const OAUTH_EXCHANGE_TTL_SECONDS = 60;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_SECONDS = 15 * 60;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    role: UserRole;
    mfaEnabled: boolean;
  };
}

export interface MfaRequiredResult {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginOutcome = AuthResult | MfaRequiredResult;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
    private readonly mfaService: MfaService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existingTenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (existingTenant) {
      throw new ConflictException(
        "Este identificador de tenant já está em uso",
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.tenantName,
          slug: dto.tenantSlug,
          webhookSecret: randomBytes(32).toString("hex"),
        },
      });

      return tx.user.create({
        data: {
          tenantId: tenant.id,
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: UserRole.OWNER,
          status: UserStatus.ACTIVE,
        },
      });
    });

    await this.recordAudit(user, AuditAction.REGISTER);

    return this.buildAuthResult(user);
  }

  async login(dto: LoginDto, ip: string): Promise<LoginOutcome> {
    const ipKey = this.loginAttemptKey("ip", ip);
    const emailKey = this.loginAttemptKey(
      "email",
      `${dto.tenantSlug}:${dto.email}`,
    );

    if (
      (await this.isLoginLocked(ipKey)) ||
      (await this.isLoginLocked(emailKey))
    ) {
      throw new HttpException(
        "Muitas tentativas de login. Tente novamente em alguns minutos.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) {
      await this.registerFailedLoginAttempt(ipKey, emailKey);
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
    });
    if (!user) {
      await this.registerFailedLoginAttempt(ipKey, emailKey);
      await this.prisma.auditLog.create({
        data: { tenantId: tenant.id, action: AuditAction.LOGIN_FAILED },
      });
      throw new UnauthorizedException("Credenciais inválidas");
    }

    if (!user.passwordHash) {
      await this.registerFailedLoginAttempt(ipKey, emailKey);
      await this.recordAudit(user, AuditAction.LOGIN_FAILED);
      throw new UnauthorizedException(
        "Esta conta usa login social (Google ou GitHub)",
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches || user.status !== UserStatus.ACTIVE) {
      await this.registerFailedLoginAttempt(ipKey, emailKey);
      await this.recordAudit(user, AuditAction.LOGIN_FAILED);
      throw new UnauthorizedException("Credenciais inválidas");
    }

    await this.clearFailedLoginAttempts(ipKey, emailKey);

    const outcome = await this.buildLoginOutcome(user);
    if (!("mfaRequired" in outcome)) {
      await this.recordAudit(user, AuditAction.LOGIN_SUCCESS);
    }
    return outcome;
  }

  async handleOAuthLogin(
    profile: NormalizedOAuthProfile,
  ): Promise<LoginOutcome> {
    const existingAccount = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      },
      include: { user: true },
    });

    const user =
      existingAccount?.user ?? (await this.createTenantAndUser(profile));

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Usuário inativo");
    }

    await this.recordAudit(user, AuditAction.OAUTH_LOGIN);

    return this.buildLoginOutcome(user);
  }

  async createOAuthExchangeCode(outcome: LoginOutcome): Promise<string> {
    const code = randomBytes(24).toString("hex");
    await this.redis.set(
      this.oauthExchangeKey(code),
      JSON.stringify(outcome),
      "EX",
      OAUTH_EXCHANGE_TTL_SECONDS,
    );
    return code;
  }

  async consumeOAuthExchangeCode(code: string): Promise<LoginOutcome> {
    const key = this.oauthExchangeKey(code);
    const raw = await this.redis.get(key);
    if (!raw) {
      throw new UnauthorizedException("Código de troca inválido ou expirado");
    }
    await this.redis.del(key);
    return JSON.parse(raw) as LoginOutcome;
  }

  async verifyMfa(mfaToken: string, code: string): Promise<AuthResult> {
    const payload = await this.verifyMfaToken(mfaToken);
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      throw new UnauthorizedException("MFA não habilitado para este usuário");
    }

    if (this.mfaService.verifyToken(code, user.mfaSecret)) {
      await this.recordAudit(user, AuditAction.LOGIN_SUCCESS);
      return this.buildAuthResult(user);
    }

    const backupCodes = this.readBackupCodes(user);
    const { valid, updatedCodes } = this.mfaService.consumeBackupCode(
      backupCodes,
      code,
    );
    if (valid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          mfaBackupCodes: updatedCodes as unknown as Prisma.InputJsonValue,
        },
      });
      await this.recordAudit(user, AuditAction.LOGIN_SUCCESS);
      return this.buildAuthResult(user);
    }

    await this.recordAudit(user, AuditAction.MFA_VERIFY_FAILED);
    throw new UnauthorizedException("Código MFA inválido");
  }

  async setupMfa(
    userId: string,
  ): Promise<{ secret: string; otpAuthUrl: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const secret = this.mfaService.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
    });

    const issuer = this.configService.get<string>("MFA_ISSUER")!;
    const otpAuthUrl = this.mfaService.buildOtpAuthUrl(
      user.email,
      secret,
      issuer,
    );
    const qrCodeDataUrl = await this.mfaService.buildQrCodeDataUrl(otpAuthUrl);

    return { secret, otpAuthUrl, qrCodeDataUrl };
  }

  async enableMfa(
    userId: string,
    code: string,
  ): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    if (!user.mfaSecret) {
      throw new UnauthorizedException(
        "Execute o setup de MFA antes de habilitar",
      );
    }
    if (!this.mfaService.verifyToken(code, user.mfaSecret)) {
      throw new UnauthorizedException("Código MFA inválido");
    }

    const { plainCodes, stored } = this.mfaService.generateBackupCodes();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: stored as unknown as Prisma.InputJsonValue,
      },
    });
    await this.recordAudit(user, AuditAction.MFA_ENABLED);

    return { backupCodes: plainCodes };
  }

  async disableMfa(
    userId: string,
    credential: { password?: string; code?: string },
  ): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const passwordOk =
      !!credential.password &&
      !!user.passwordHash &&
      (await bcrypt.compare(credential.password, user.passwordHash));
    const codeOk =
      !!credential.code &&
      !!user.mfaSecret &&
      this.mfaService.verifyToken(credential.code, user.mfaSecret);

    if (!passwordOk && !codeOk) {
      throw new UnauthorizedException(
        "Confirmação inválida para desabilitar o MFA",
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: Prisma.JsonNull,
      },
    });
    await this.recordAudit(user, AuditAction.MFA_DISABLED);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedException("Refresh token inválido");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Refresh token inválido");
    }

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(user);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (
      storedToken &&
      storedToken.userId === userId &&
      !storedToken.revokedAt
    ) {
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }

    await this.prisma.auditLog.create({
      data: { userId, action: AuditAction.LOGOUT },
    });
  }

  private async createTenantAndUser(
    profile: NormalizedOAuthProfile,
  ): Promise<User> {
    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: profile.name,
          slug: this.buildTenantSlug(profile.name || profile.email),
          webhookSecret: randomBytes(32).toString("hex"),
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: profile.name,
          email: profile.email,
          role: UserRole.OWNER,
          status: UserStatus.ACTIVE,
        },
      });

      await tx.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: profile.provider,
          providerAccountId: profile.providerAccountId,
        },
      });

      return user;
    });
  }

  private buildTenantSlug(seed: string): string {
    const base = seed
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const suffix = randomBytes(3).toString("hex");
    return `${base || "tenant"}-${suffix}`;
  }

  private async buildLoginOutcome(user: User): Promise<LoginOutcome> {
    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: await this.signMfaToken(user.id) };
    }
    return this.buildAuthResult(user);
  }

  private async signMfaToken(userId: string): Promise<string> {
    const payload: MfaTokenPayload = { sub: userId, type: "mfa" };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: MFA_TOKEN_EXPIRES_IN,
    });
  }

  private async verifyMfaToken(mfaToken: string): Promise<MfaTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<MfaTokenPayload>(
        mfaToken,
        { secret: this.configService.get<string>("JWT_ACCESS_SECRET") },
      );
      if (payload.type !== "mfa") {
        throw new UnauthorizedException("Token MFA inválido");
      }
      return payload;
    } catch {
      throw new UnauthorizedException("Token MFA inválido");
    }
  }

  private readBackupCodes(user: User): MfaBackupCode[] {
    return (user.mfaBackupCodes as unknown as MfaBackupCode[] | null) ?? [];
  }

  private oauthExchangeKey(code: string): string {
    return `oauth-exchange:${code}`;
  }

  private loginAttemptKey(kind: "ip" | "email", value: string): string {
    return `auth:login-fail:${kind}:${value}`;
  }

  private async isLoginLocked(key: string): Promise<boolean> {
    const attempts = await this.redis.get(key);
    return attempts !== null && Number(attempts) >= MAX_LOGIN_ATTEMPTS;
  }

  private async registerFailedLoginAttempt(...keys: string[]): Promise<void> {
    await Promise.all(
      keys.map(async (key) => {
        const attempts = await this.redis.incr(key);
        if (attempts === 1) {
          await this.redis.expire(key, LOGIN_LOCKOUT_SECONDS);
        }
      }),
    );
  }

  private async clearFailedLoginAttempts(...keys: string[]): Promise<void> {
    await this.redis.del(...keys);
  }

  private async verifyRefreshToken(
    refreshToken: string,
  ): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        { secret: this.configService.get<string>("JWT_REFRESH_SECRET") },
      );
      if (payload.type !== "refresh") {
        throw new UnauthorizedException("Refresh token inválido");
      }
      return payload;
    } catch {
      throw new UnauthorizedException("Refresh token inválido");
    }
  }

  private async buildAuthResult(user: User): Promise<AuthResult> {
    const tokens = await this.generateTokens(user);
    return {
      ...tokens,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        name: user.name,
        email: user.email,
        role: user.role,
        mfaEnabled: user.mfaEnabled,
      },
    };
  }

  private async generateTokens(user: User): Promise<AuthTokens> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      type: "access",
    };
    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get<string>("JWT_ACCESS_SECRET"),
      expiresIn: this.configService.get<string>(
        "JWT_ACCESS_EXPIRES_IN",
      ) as JwtSignOptions["expiresIn"],
    });

    const refreshPayload: RefreshTokenPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      jti: randomUUID(),
      type: "refresh",
    };
    const refreshExpiresIn = this.configService.get<string>(
      "JWT_REFRESH_EXPIRES_IN",
    ) as JwtSignOptions["expiresIn"];
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
      expiresIn: refreshExpiresIn,
    });

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    const expiresAt = new Date(decoded.exp * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async recordAudit(user: User, action: AuditAction): Promise<void> {
    await this.prisma.auditLog.create({
      data: { tenantId: user.tenantId, userId: user.id, action },
    });
  }
}
