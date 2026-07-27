import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AuthGuard } from "@nestjs/passport";
import { UserRole } from "@prisma/client";
import type { Request, Response } from "express";
import { AuthService, LoginOutcome } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import { LoginDto } from "./dto/login.dto";
import { MfaDisableDto } from "./dto/mfa-disable.dto";
import { MfaEnableDto } from "./dto/mfa-enable.dto";
import { MfaVerifyDto } from "./dto/mfa-verify.dto";
import { OAuthExchangeDto } from "./dto/oauth-exchange.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { RegisterDto } from "./dto/register.dto";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { AuthenticatedUser } from "./interfaces/jwt-payload.interface";
import { NormalizedOAuthProfile } from "./interfaces/oauth-profile.interface";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post("register")
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(user.id, dto.refreshToken);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MEMBER)
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }

  @Get("google")
  @UseGuards(AuthGuard("google"))
  googleAuth() {}

  @Get("google/callback")
  @UseGuards(AuthGuard("google"))
  async googleCallback(
    @Req() req: Request & { user: NormalizedOAuthProfile },
    @Res() res: Response,
  ) {
    await this.redirectAfterOAuth(req.user, res);
  }

  @Get("github")
  @UseGuards(AuthGuard("github"))
  githubAuth() {}

  @Get("github/callback")
  @UseGuards(AuthGuard("github"))
  async githubCallback(
    @Req() req: Request & { user: NormalizedOAuthProfile },
    @Res() res: Response,
  ) {
    await this.redirectAfterOAuth(req.user, res);
  }

  @Post("oauth/exchange")
  @HttpCode(HttpStatus.OK)
  exchangeOAuthCode(@Body() dto: OAuthExchangeDto): Promise<LoginOutcome> {
    return this.authService.consumeOAuthExchangeCode(dto.code);
  }

  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.authService.verifyMfa(dto.mfaToken, dto.code);
  }

  @Post("mfa/setup")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  setupMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.setupMfa(user.id);
  }

  @Post("mfa/enable")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  enableMfa(@CurrentUser() user: AuthenticatedUser, @Body() dto: MfaEnableDto) {
    return this.authService.enableMfa(user.id, dto.code);
  }

  @Post("mfa/disable")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  async disableMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaDisableDto,
  ) {
    await this.authService.disableMfa(user.id, dto);
  }

  private async redirectAfterOAuth(
    profile: NormalizedOAuthProfile,
    res: Response,
  ): Promise<void> {
    const outcome = await this.authService.handleOAuthLogin(profile);
    const code = await this.authService.createOAuthExchangeCode(outcome);
    const webUrl = this.configService.get<string>("WEB_URL");
    res.redirect(`${webUrl}/oauth/callback?code=${code}`);
  }
}
