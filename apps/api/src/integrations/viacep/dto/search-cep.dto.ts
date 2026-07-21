import { IsString, Length, MinLength } from "class-validator";

export class SearchCepDto {
  @IsString()
  @Length(2, 2)
  uf!: string;

  @IsString()
  @MinLength(3)
  city!: string;

  @IsString()
  @MinLength(3)
  street!: string;
}
