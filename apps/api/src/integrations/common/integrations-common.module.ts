import { Global, Module } from "@nestjs/common";
import { ResilientHttpClient } from "./resilient-http-client";

@Global()
@Module({
  providers: [ResilientHttpClient],
  exports: [ResilientHttpClient],
})
export class IntegrationsCommonModule {}
