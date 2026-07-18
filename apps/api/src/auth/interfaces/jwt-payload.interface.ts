import { UserRole } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  tenantId: string;
  role: UserRole;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  jti: string;
  type: "refresh";
}

export interface AuthenticatedUser {
  id: string;
  tenantId: string;
  role: UserRole;
}
