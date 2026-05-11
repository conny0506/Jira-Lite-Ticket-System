import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CalendarNotesController } from './calendar-notes.controller';
import { CalendarNotesService } from './calendar-notes.service';

@Module({
  imports: [AuthModule],
  controllers: [CalendarNotesController],
  providers: [CalendarNotesService],
})
export class CalendarNotesModule {}
