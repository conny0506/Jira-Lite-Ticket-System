import { IsOptional, IsString, Length } from 'class-validator';

export class RefreshTokenDto {
  @IsOptional()
  @IsString()
  @Length(20, 500)
  refreshToken?: string;
}
