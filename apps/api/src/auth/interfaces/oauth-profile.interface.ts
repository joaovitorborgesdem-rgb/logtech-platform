import { OAuthProvider } from "@prisma/client";

export interface NormalizedOAuthProfile {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string;
  name: string;
}
