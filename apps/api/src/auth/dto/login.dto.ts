import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class LoginDto {
  @IsString()
  @MinLength(1)
  tenantSlug!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
