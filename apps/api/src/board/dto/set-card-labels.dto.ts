import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetCardLabelsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  labelIds!: string[];
}
