import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue, Worker } from 'bullmq';

type TicketEventPayload = {
  ticketId: string;
  event: 'created' | 'updated';
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection = {
    host: process.env.REDIS_HOST ?? '127.0.0.1',
    port: Number(process.env.REDIS_PORT ?? 6379),
  };

  private readonly queue = new Queue('ticket-events', {
    connection: this.connection,
  });

  private readonly worker = new Worker(
    'ticket-events',
    async (job) => {
      const data = job.data as TicketEventPayload;
      // Burasi email/slack gibi async entegrasyonlar icin genisletilecek.
      // eslint-disable-next-line no-console
      console.log(`[BullMQ] ticket ${data.ticketId} event: ${data.event}`);
    },
    { connection: this.connection },
  );

  async addTicketEvent(payload: TicketEventPayload) {
    const options: JobsOptions = { removeOnComplete: 100, removeOnFail: 100 };
    await this.queue.add('ticket-event', payload, options);
  }

  async onModuleDestroy() {
    await this.worker.close();
    await this.queue.close();
  }
}
