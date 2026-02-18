import { IsEmail, IsString, MaxLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  @IsEmail()
  @MaxLength(200)
  email!: string;
}
