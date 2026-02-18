import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(['tr', 'en'])
  language?: 'tr' | 'en';

  @IsOptional()
  @IsBoolean()
  notificationEmailEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationAssignmentEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationReviewEnabled?: boolean;
}
