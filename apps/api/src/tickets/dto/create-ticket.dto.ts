import { TicketPriority } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateTicketDto {
  @IsOptional()
  @IsString()
  projectId?: string;

  @Transform(({ value }) => {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) return [value];
    return [];
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  assigneeIds?: string[];

  @IsOptional()
  @IsIn(['MANUAL', 'DEPARTMENT'])
  assignmentMode?: 'MANUAL' | 'DEPARTMENT';

  @IsOptional()
  @IsIn(['SOFTWARE', 'INDUSTRIAL', 'MECHANICAL', 'ELECTRICAL_ELECTRONICS'])
  targetDepartment?: 'SOFTWARE' | 'INDUSTRIAL' | 'MECHANICAL' | 'ELECTRICAL_ELECTRONICS';

  @IsOptional()
  @IsIn(['ALL', 'SELECTED'])
  departmentSelectionMode?: 'ALL' | 'SELECTED';

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

  @IsString()
  @Length(1, 100)
  dueAt!: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  attachmentNote?: string;
}
