import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class UpdateChecklistItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @IsOptional()
  text?: string;

  @IsBoolean()
  @IsOptional()
  done?: boolean;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}
