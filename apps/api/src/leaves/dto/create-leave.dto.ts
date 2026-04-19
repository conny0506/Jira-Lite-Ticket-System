import { IsDateString, IsString, Length } from 'class-validator';

export class CreateLeaveDto {
  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsString()
  @Length(1, 1000)
  reason!: string;
}
