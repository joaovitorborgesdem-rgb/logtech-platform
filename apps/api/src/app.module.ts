import { BullModule } from "@nestjs/bullmq";
import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { CarriersModule } from "./carriers/carriers.module";
import { ClientsModule } from "./clients/clients.module";
import { validate } from "./config/env.validation";
import { FreightQuotesModule } from "./freight-quotes/freight-quotes.module";
import { HealthModule } from "./health/health.module";
import { ViaCepModule } from "./integrations/viacep/viacep.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TenantMiddleware } from "./tenant/tenant.middleware";
import { TenantModule } from "./tenant/tenant.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
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
    HealthModule,
    AuthModule,
    TenantModule,
    CarriersModule,
    ClientsModule,
    FreightQuotesModule,
    ViaCepModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes("*");
  }
}
