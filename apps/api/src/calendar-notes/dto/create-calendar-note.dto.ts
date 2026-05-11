import { IsDateString, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCalendarNoteDto {
  @IsDateString()
  date!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  content!: string;
}
