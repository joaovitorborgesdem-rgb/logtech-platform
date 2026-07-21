import { IsString, Matches } from "class-validator";

const CNPJ_REGEX = /^\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}$/;

export class CnpjParamDto {
  @IsString()
  @Matches(CNPJ_REGEX, { message: "cnpj deve ser um CNPJ válido" })
  cnpj!: string;
}
