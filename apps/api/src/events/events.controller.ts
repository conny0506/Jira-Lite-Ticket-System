import { Controller, Post, Query, Req, Sse, UnauthorizedException } from '@nestjs/common';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { verifyAccessToken } from '../auth/token.util';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post('ticket')
  issueTicket(
    @Req() req: { headers: Record<string, string | undefined> },
  ): { ticket: string } {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new UnauthorizedException('Authorization basligı zorunludur');
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException('Bearer token gerekli');
    try {
      const payload = verifyAccessToken(token);
      const ticket = this.eventsService.generateTicket(payload.sub);
      return { ticket };
    } catch {
      throw new UnauthorizedException('Token gecersiz veya suresi dolmus');
    }
  }

  @Sse('stream')
  stream(
    @Query('ticket') ticket: string,
    @Req() req: { on: (event: string, cb: () => void) => void },
  ): Observable<MessageEvent> {
    if (!ticket) throw new UnauthorizedException('Ticket zorunludur');

    let memberId: string;
    try {
      memberId = this.eventsService.redeemTicket(ticket);
    } catch {
      throw new UnauthorizedException('Ticket gecersiz veya suresi dolmus');
    }

    const { observable, subject } = this.eventsService.addConnection(memberId);
    const closed$ = new Subject<void>();

    req.on('close', () => {
      this.eventsService.removeConnection(memberId, subject);
      subject.complete();
      closed$.next();
      closed$.complete();
    });

    const heartbeat$ = interval(25000).pipe(
      takeUntil(closed$),
      map(() => ({ data: JSON.stringify({ type: 'ping' }) } as MessageEvent)),
    );

    return merge(observable, heartbeat$);
  }
}
