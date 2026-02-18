import { IsString, Length } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @Length(32, 256)
  token!: string;

  @IsString()
  @Length(6, 200)
  newPassword!: string;
}
