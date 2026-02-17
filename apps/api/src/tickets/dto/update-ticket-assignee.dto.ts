import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateTicketAssigneeDto {
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  assigneeIds!: string[];
}
