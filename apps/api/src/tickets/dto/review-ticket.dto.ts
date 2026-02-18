import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum TicketReviewAction {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ReviewTicketDto {
  @IsEnum(TicketReviewAction)
  action!: TicketReviewAction;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason?: string;
}
