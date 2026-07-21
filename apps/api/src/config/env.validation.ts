import { plainToInstance, Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from "class-validator";

enum Environment {
  Development = "development",
  Production = "production",
  Test = "test",
}

class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  @IsString()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = "15m";

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = "7d";

  @IsString()
  @IsOptional()
  REDIS_HOST: string = "localhost";

  @IsInt()
  @Min(1)
  @IsOptional()
  REDIS_PORT: number = 6379;

  @IsString()
  @IsOptional()
  S3_ENDPOINT: string = "http://localhost:9000";

  @IsString()
  @IsOptional()
  S3_REGION: string = "us-east-1";

  @IsString()
  @IsOptional()
  S3_BUCKET: string = "logisense-uploads";

  @IsString()
  @IsOptional()
  S3_ACCESS_KEY_ID: string = "logisense";

  @IsString()
  @IsOptional()
  S3_SECRET_ACCESS_KEY: string = "logisense123";

  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === true || value === "true")
  S3_FORCE_PATH_STYLE: boolean = true;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validatedConfig;
}
