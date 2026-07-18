import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  tenantName!: string;

  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      "tenantSlug deve conter apenas letras minúsculas, números e hífens",
  })
  tenantSlug!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
