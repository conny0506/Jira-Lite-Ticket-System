import { IsOptional, IsString, Length } from 'class-validator';

export class UploadCaptainFileDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  note?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  submittedForMemberId?: string;
}
