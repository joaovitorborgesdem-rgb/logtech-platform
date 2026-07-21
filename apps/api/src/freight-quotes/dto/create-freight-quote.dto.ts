import { IsNumber, IsPositive, IsString, Matches } from "class-validator";

const CEP_REGEX = /^\d{5}-?\d{3}$/;

export class CreateFreightQuoteDto {
  @IsString()
  @Matches(CEP_REGEX, { message: "originZipCode deve ser um CEP válido" })
  originZipCode!: string;

  @IsString()
  @Matches(CEP_REGEX, { message: "destinationZipCode deve ser um CEP válido" })
  destinationZipCode!: string;

  @IsNumber()
  @IsPositive()
  weightKg!: number;

  @IsNumber()
  @IsPositive()
  lengthCm!: number;

  @IsNumber()
  @IsPositive()
  widthCm!: number;

  @IsNumber()
  @IsPositive()
  heightCm!: number;

  @IsNumber()
  @IsPositive()
  cargoValue!: number;
}
