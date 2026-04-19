import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AuthModule } from './auth/auth.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health.controller';
import { LeavesModule } from './leaves/leaves.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProjectsModule } from './projects/projects.module';
import { QuotesModule } from './quotes/quotes.module';
import { QueueModule } from './queue/queue.module';
import { StorageModule } from './storage/storage.module';
import { TeamMembersModule } from './team-members/team-members.module';
import { TicketsModule } from './tickets/tickets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AnnouncementsModule,
    AuthModule,
    EventsModule,
    LeavesModule,
    MeetingsModule,
    PrismaModule,
    QuotesModule,
    QueueModule,
    StorageModule,
    TeamMembersModule,
    ProjectsModule,
    TicketsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
