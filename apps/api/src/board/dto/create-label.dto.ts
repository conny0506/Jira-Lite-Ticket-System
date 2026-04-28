import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  name!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color hex formatinda olmali (orn. #23a4ff)' })
  color!: string;
}
