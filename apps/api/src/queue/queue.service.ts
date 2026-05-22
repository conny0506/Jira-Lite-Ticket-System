import { Injectable } from '@nestjs/common';

type TicketEventPayload = {
  ticketId: string;
  event: 'created' | 'updated';
};

@Injectable()
export class QueueService {
  async addTicketEvent(payload: TicketEventPayload) {
    // TODO: email/Slack entegrasyonu eklendiginde burasi gercek kuyruga baglanacak.
    // eslint-disable-next-line no-console
    console.log(`[TicketEvent] ticket ${payload.ticketId} event: ${payload.event}`);
  }
}
