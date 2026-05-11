import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { CalendarNotesService } from './calendar-notes.service';
import { CreateCalendarNoteDto } from './dto/create-calendar-note.dto';

@Controller('calendar-notes')
export class CalendarNotesController {
  constructor(private readonly calendarNotesService: CalendarNotesService) {}

  @Get()
  list(@Query('month') month: string) {
    return this.calendarNotesService.list(month);
  }

  @Post()
  create(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Body() dto: CreateCalendarNoteDto,
  ) {
    return this.calendarNotesService.create(actorId, role, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.calendarNotesService.remove(actorId, role, id);
  }
}
