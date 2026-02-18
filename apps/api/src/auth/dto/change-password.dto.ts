import { IsString, Length } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @Length(4, 200)
  currentPassword!: string;

  @IsString()
  @Length(6, 200)
  newPassword!: string;
}
