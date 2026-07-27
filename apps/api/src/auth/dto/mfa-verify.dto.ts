import { IsString, Matches, MinLength } from "class-validator";

export class MfaVerifyDto {
  @IsString()
  @MinLength(1)
  mfaToken!: string;

  @IsString()
  @Matches(/^[0-9a-f-]{6,}$/i, {
    message: "code deve ser um token TOTP de 6 dígitos ou um código de backup",
  })
  code!: string;
}
