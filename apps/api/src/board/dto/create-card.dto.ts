import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsEnum(['TODO', 'IN_PROGRESS', 'DONE'])
  @IsOptional()
  status?: 'TODO' | 'IN_PROGRESS' | 'DONE';

  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'MEDIUM' | 'HIGH';

  @IsString()
  @MaxLength(5000)
  @IsOptional()
  description?: string;

  @IsISO8601()
  @IsOptional()
  startAt?: string;

  @IsISO8601()
  @IsOptional()
  dueAt?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  position?: number;
}
