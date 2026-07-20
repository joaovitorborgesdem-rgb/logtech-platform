import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { tenantScopedPrismaProvider } from "./tenant-scoped-prisma.provider";

@Global()
@Module({
  providers: [PrismaService, tenantScopedPrismaProvider],
  exports: [PrismaService, tenantScopedPrismaProvider],
})
export class PrismaModule {}
