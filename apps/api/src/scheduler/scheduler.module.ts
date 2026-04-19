import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DeadlineSchedulerService } from './deadline-scheduler.service';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [DeadlineSchedulerService],
})
export class SchedulerModule {}
