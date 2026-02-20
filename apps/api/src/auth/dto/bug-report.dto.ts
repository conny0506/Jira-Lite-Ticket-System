import { IsOptional, IsString, Length } from 'class-validator';

export class BugReportDto {
  @IsString()
  @Length(10, 4000)
  description!: string;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  userName?: string;

  @IsOptional()
  @IsString()
  @Length(0, 320)
  userEmail?: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  pageUrl?: string;
}
