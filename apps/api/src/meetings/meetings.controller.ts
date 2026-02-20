import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CreateMeetingDto } from './dto/create-meeting.dto';
import { MeetingsService } from './meetings.service';

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetingsService: MeetingsService) {}

  @Get('current')
  current(@CurrentUserId() actorId: string) {
    return this.meetingsService.getCurrent(actorId);
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateMeetingDto) {
    return this.meetingsService.create(actorId, dto);
  }
}
