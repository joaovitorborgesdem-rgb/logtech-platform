import { IsOptional, IsString } from "class-validator";

export class MfaDisableDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  code?: string;
}
