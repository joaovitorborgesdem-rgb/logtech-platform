import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class CreateCarrierDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name!: string;

  @IsString()
  @Length(11, 18)
  document!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  state?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerKg?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  pricePerKm?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  insuranceRate?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  avgSpeedKmPerDay?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  handlingDays?: number;
}
