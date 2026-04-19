import { IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class ReviewLeaveDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  @Length(1, 500)
  reviewNote?: string;
}
