import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @ValidateIf((o) => o.description !== null)
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string | null;

  @ValidateIf((o) => o.startAt !== null)
  @IsISO8601()
  @IsOptional()
  startAt?: string | null;

  @ValidateIf((o) => o.dueAt !== null)
  @IsISO8601()
  @IsOptional()
  dueAt?: string | null;

  @IsBoolean()
  @IsOptional()
  hideCompletedChecklist?: boolean;
}
