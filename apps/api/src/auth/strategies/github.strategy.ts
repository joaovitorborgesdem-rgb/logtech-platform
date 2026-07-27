import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { OAuthProvider } from "@prisma/client";
import { Profile, Strategy } from "passport-github2";
import { NormalizedOAuthProfile } from "../interfaces/oauth-profile.interface";

type GithubDoneCallback = (
  error: Error | null,
  user?: NormalizedOAuthProfile,
) => void;

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, "github") {
  constructor(configService: ConfigService) {
    super({
      clientID: configService.get<string>("GITHUB_CLIENT_ID")!,
      clientSecret: configService.get<string>("GITHUB_CLIENT_SECRET")!,
      callbackURL: configService.get<string>("GITHUB_CALLBACK_URL")!,
      scope: ["user:email"],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: GithubDoneCallback,
  ): void {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      done(
        new UnauthorizedException(
          "Conta GitHub sem e-mail público/verificado disponível",
        ),
      );
      return;
    }

    const normalized: NormalizedOAuthProfile = {
      provider: OAuthProvider.GITHUB,
      providerAccountId: profile.id,
      email,
      name: profile.displayName || profile.username || email,
    };
    done(null, normalized);
  }
}
