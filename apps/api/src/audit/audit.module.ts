import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { AuditLogsController } from "./audit-logs.controller";
import { AuditLogsService } from "./audit-logs.service";
import { MutationAuditInterceptor } from "./mutation-audit.interceptor";

@Module({
  controllers: [AuditLogsController],
  providers: [
    AuditLogsService,
    { provide: APP_INTERCEPTOR, useClass: MutationAuditInterceptor },
  ],
})
export class AuditModule {}
