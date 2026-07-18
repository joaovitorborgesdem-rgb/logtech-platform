import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AccessTokenPayload } from "../interfaces/jwt-payload.interface";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_ACCESS_SECRET")!,
    });
  }

  validate(payload: AccessTokenPayload) {
    if (payload.type !== "access") {
      throw new UnauthorizedException("Tipo de token inválido");
    }
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      role: payload.role,
    };
  }
}
