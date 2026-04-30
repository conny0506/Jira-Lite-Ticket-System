import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

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

  @ValidateIf((o) => o.coverColor !== null)
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  @IsOptional()
  coverColor?: string | null;

  @ValidateIf((o) => o.coverImageUrl !== null)
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  coverImageUrl?: string | null;
}
