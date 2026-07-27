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

  @IsInt()
  @Min(0)
  @IsOptional()
  REDIS_DB: number = 0;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

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

  @IsString()
  @IsOptional()
  WEB_URL: string = "http://localhost:3001";

  @IsString()
  @IsOptional()
  MFA_ISSUER: string = "LogiSense";

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID: string = "not-configured";

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET: string = "not-configured";

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL: string = "http://localhost:3000/auth/google/callback";

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_ID: string = "not-configured";

  @IsString()
  @IsOptional()
  GITHUB_CLIENT_SECRET: string = "not-configured";

  @IsString()
  @IsOptional()
  GITHUB_CALLBACK_URL: string = "http://localhost:3000/auth/github/callback";
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
