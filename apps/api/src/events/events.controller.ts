import { Controller, Query, Req, Sse, UnauthorizedException } from '@nestjs/common';
import { Observable, interval, merge } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';
import { verifyAccessToken } from '../auth/token.util';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Sse('stream')
  stream(
    @Query('token') token: string,
    @Req() req: { on: (event: string, cb: () => void) => void },
  ): Observable<MessageEvent> {
    if (!token) throw new UnauthorizedException('Token zorunludur');

    let memberId: string;
    try {
      const payload = verifyAccessToken(token);
      memberId = payload.sub;
    } catch {
      throw new UnauthorizedException('Token gecersiz veya suresi dolmus');
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
