import { IsString, Matches } from "class-validator";

export class MfaEnableDto {
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: "code deve ser um token TOTP de 6 dígitos",
  })
  code!: string;
}
