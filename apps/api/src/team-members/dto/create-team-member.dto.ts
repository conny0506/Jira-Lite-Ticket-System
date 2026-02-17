import { TeamRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';

export class CreateTeamMemberDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;

  @IsString()
  @Length(4, 100)
  password!: string;
}
