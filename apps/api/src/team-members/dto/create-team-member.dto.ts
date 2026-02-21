import { Department, TeamRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

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

  @IsEnum(Department)
  primaryDepartment!: Department;

  @IsOptional()
  @IsEnum(Department)
  secondaryDepartment?: Department;

  @IsOptional()
  @IsBoolean()
  isIntern?: boolean;
}
