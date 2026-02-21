import { Department, TeamRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(TeamRole)
  role?: TeamRole;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @Length(4, 100)
  password?: string;

  @IsOptional()
  @IsEnum(Department)
  primaryDepartment?: Department;

  @IsOptional()
  @IsEnum(Department)
  secondaryDepartment?: Department;

  @IsOptional()
  @IsBoolean()
  isIntern?: boolean;
}
