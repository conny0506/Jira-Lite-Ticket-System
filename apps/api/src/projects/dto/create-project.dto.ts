import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @Length(2, 40)
  name!: string;

  @IsString()
  @Matches(/^[A-Z][A-Z0-9]{1,9}$/)
  key!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  description?: string;
}
