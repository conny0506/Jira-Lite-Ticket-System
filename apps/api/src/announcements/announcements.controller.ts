import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { AnnouncementsService } from './announcements.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Get()
  findAll() {
    return this.announcementsService.findAll();
  }

  @Post()
  create(
    @CurrentUserId() actorId: string,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(actorId, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() actorRole: string,
    @Param('id') id: string,
  ) {
    return this.announcementsService.remove(actorId, id, actorRole);
  }
}
