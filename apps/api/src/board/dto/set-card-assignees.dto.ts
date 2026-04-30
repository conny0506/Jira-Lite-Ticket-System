import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetCardAssigneesDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  memberIds!: string[];
}
