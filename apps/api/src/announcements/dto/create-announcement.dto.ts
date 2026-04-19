import { IsString, Length } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(1, 5000)
  content!: string;
}
