import { IsOptional, IsString, Length } from 'class-validator';

export class CreateSubmissionDto {
  @IsString()
  submittedById!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  note?: string;

  @IsOptional()
  @IsString()
  @Length(3, 1000)
  lateReason?: string;
}
