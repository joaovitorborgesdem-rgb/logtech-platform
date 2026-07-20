import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TenantContextInterceptor } from "./tenant-context.interceptor";
import { TenantMiddleware } from "./tenant.middleware";

@Module({
  providers: [
    TenantMiddleware,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [TenantMiddleware],
})
export class TenantModule {}
