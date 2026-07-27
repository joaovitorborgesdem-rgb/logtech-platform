import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { OAuthProvider } from "@prisma/client";
import { Profile, Strategy, VerifyCallback } from "passport-google-oauth20";
import { NormalizedOAuthProfile } from "../interfaces/oauth-profile.interface";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>("GOOGLE_CLIENT_ID")!,
      clientSecret: configService.get<string>("GOOGLE_CLIENT_SECRET")!,
      callbackURL: configService.get<string>("GOOGLE_CALLBACK_URL")!,
      scope: ["email", "profile"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(new UnauthorizedException("Conta Google sem e-mail disponível"));
      return;
    }

    const normalized: NormalizedOAuthProfile = {
      provider: OAuthProvider.GOOGLE,
      providerAccountId: profile.id,
      email,
      name: profile.displayName || email,
    };
    done(null, normalized);
  }
}
