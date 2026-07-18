import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService, JwtSignOptions } from "@nestjs/jwt";
import { AuditAction, User, UserRole, UserStatus } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { createHash, randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import {
  AccessTokenPayload,
  RefreshTokenPayload,
} from "./interfaces/jwt-payload.interface";

const BCRYPT_SALT_ROUNDS = 12;

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
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
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

  async login(dto: LoginDto): Promise<AuthResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { slug: dto.tenantSlug },
    });
    if (!tenant) {
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const user = await this.prisma.user.findUnique({
      where: { tenantId_email: { tenantId: tenant.id, email: dto.email } },
    });
    if (!user) {
      await this.prisma.auditLog.create({
        data: { tenantId: tenant.id, action: AuditAction.LOGIN_FAILED },
      });
      throw new UnauthorizedException("Credenciais inválidas");
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches || user.status !== UserStatus.ACTIVE) {
      await this.recordAudit(user, AuditAction.LOGIN_FAILED);
      throw new UnauthorizedException("Credenciais inválidas");
    }

    await this.recordAudit(user, AuditAction.LOGIN_SUCCESS);

    return this.buildAuthResult(user);
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
