import { TicketStatus } from '@prisma/client';
import { ArrayNotEmpty, IsArray, IsEnum, IsString } from 'class-validator';

export class BulkUpdateTicketStatusDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ticketIds!: string[];

  @IsEnum(TicketStatus)
  status!: TicketStatus;
}
