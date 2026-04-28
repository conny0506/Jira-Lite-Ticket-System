import { IsEnum, IsInt, Min } from 'class-validator';

export class MoveCardDto {
  @IsEnum(['TODO', 'IN_PROGRESS', 'DONE'])
  status!: 'TODO' | 'IN_PROGRESS' | 'DONE';

  @IsInt()
  @Min(0)
  position!: number;
}
