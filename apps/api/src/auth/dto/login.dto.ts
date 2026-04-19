import { IsBoolean, IsEmail, IsOptional, IsString, Length } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @Length(4, 100)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
