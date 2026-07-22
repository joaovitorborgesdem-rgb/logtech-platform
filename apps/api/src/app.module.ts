import { BullModule } from "@nestjs/bullmq";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AttachmentsModule } from "./attachments/attachments.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CarriersModule } from "./carriers/carriers.module";
import { ClientsModule } from "./clients/clients.module";
import { validate } from "./config/env.validation";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FreightQuotesModule } from "./freight-quotes/freight-quotes.module";
import { HealthModule } from "./health/health.module";
import { InsightsModule } from "./insights/insights.module";
import { CnpjModule } from "./integrations/cnpj/cnpj.module";
import { IntegrationsCommonModule } from "./integrations/common/integrations-common.module";
import { ViaCepModule } from "./integrations/viacep/viacep.module";
import { LoggingModule } from "./observability/logging/logging.module";
import { MetricsMiddleware } from "./observability/metrics/metrics.middleware";
import { MetricsModule } from "./observability/metrics/metrics.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { StorageModule } from "./storage/storage.module";
import { TenantMiddleware } from "./tenant/tenant.middleware";
import { TenantModule } from "./tenant/tenant.module";
import { WebhooksModule } from "./webhooks/webhooks.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    LoggingModule,
    MetricsModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>("REDIS_HOST", "localhost"),
          port: config.get<number>("REDIS_PORT", 6379),
        },
      }),
    }),
    PrismaModule,
    RedisModule,
    IntegrationsCommonModule,
    StorageModule,
    HealthModule,
    AuthModule,
    TenantModule,
    AuditModule,
    CarriersModule,
    ClientsModule,
    FreightQuotesModule,
    ViaCepModule,
    CnpjModule,
    DashboardModule,
    InsightsModule,
    WebhooksModule,
    AttachmentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes("*");
    consumer.apply(MetricsMiddleware).exclude("/metrics").forRoutes("*");
  }
}
