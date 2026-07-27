import { IsString, MinLength } from "class-validator";

export class OAuthExchangeDto {
  @IsString()
  @MinLength(1)
  code!: string;
}
