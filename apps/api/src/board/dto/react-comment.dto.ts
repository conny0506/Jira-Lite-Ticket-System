import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ReactCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  // Allow common emoji code points (any non-ASCII char or one of small ASCII set)
  @Matches(/^.{1,8}$/u)
  emoji!: string;
}
