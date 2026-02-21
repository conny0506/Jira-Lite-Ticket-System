import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMeetingDto {
  @IsDateString()
  scheduledAt!: string;

  @IsString()
  @MaxLength(2048)
  meetingUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsBoolean()
  includeInterns?: boolean;
}
