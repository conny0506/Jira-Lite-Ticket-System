import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { AuthModule } from '../auth/auth.module';
import { QueueModule } from '../queue/queue.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [QueueModule, AuthModule, AuditLogsModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
