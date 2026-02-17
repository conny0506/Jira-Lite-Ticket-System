import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';

@Module({
  imports: [QueueModule],
  controllers: [TicketsController],
  providers: [TicketsService],
})
export class TicketsModule {}
