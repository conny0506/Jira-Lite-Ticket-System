import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';

export class UpdateBoardConfigDto {
  @ValidateIf((o) => o.wipLimitTodo !== null)
  @IsInt()
  @Min(0)
  @IsOptional()
  wipLimitTodo?: number | null;

  @ValidateIf((o) => o.wipLimitInProgress !== null)
  @IsInt()
  @Min(0)
  @IsOptional()
  wipLimitInProgress?: number | null;

  @ValidateIf((o) => o.wipLimitDone !== null)
  @IsInt()
  @Min(0)
  @IsOptional()
  wipLimitDone?: number | null;
}
