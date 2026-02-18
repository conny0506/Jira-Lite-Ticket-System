import { TicketPriority } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class CreateTicketDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsString()
  @Length(3, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 5000)
  description?: string;

  @IsOptional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;

  @IsDateString()
  dueAt!: string;
}
