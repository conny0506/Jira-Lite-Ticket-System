import {
  ArrayMaxSize,
  IsIn,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const DEPARTMENTS = ['SOFTWARE', 'INDUSTRIAL', 'MECHANICAL', 'ELECTRICAL_ELECTRONICS'] as const;
const MEETING_TARGET_MODES = ['ALL', 'SELECTED'] as const;

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

  @IsOptional()
  @IsIn(MEETING_TARGET_MODES)
  targetMode?: (typeof MEETING_TARGET_MODES)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsIn(DEPARTMENTS, { each: true })
  targetDepartments?: (typeof DEPARTMENTS)[number][];
}
