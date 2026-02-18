import { IsArray, IsOptional, IsString } from 'class-validator';

export class MarkTicketsSeenDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ticketIds?: string[];
}
