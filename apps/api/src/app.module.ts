import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AnnouncementsModule } from './announcements/announcements.module';
import { CalendarNotesModule } from './calendar-notes/calendar-notes.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { BoardModule } from './board/board.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { LeavesModule } from './leaves/leaves.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotesModule } from './quotes/quotes.module';
import { QueueModule } from './queue/queue.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { StorageModule } from './storage/storage.module';
import { TeamMembersModule } from './team-members/team-members.module';
import { TemplatesModule } from './templates/templates.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AnnouncementsModule,
    AuditLogsModule,
    CalendarNotesModule,
    AuthModule,
    BoardModule,
    EventsModule,
    LeavesModule,
    MeetingsModule,
    PrismaModule,
    QuotesModule,
    QueueModule,
    SchedulerModule,
    StorageModule,
    TeamMembersModule,
    TemplatesModule,
    ProjectsModule,
    TicketsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
