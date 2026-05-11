import { Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Subject, Observable } from 'rxjs';

export type SsePayload =
  | { type: 'ticket:assigned'; ticketId: string; ticketTitle: string; assignedByName: string }
  | { type: 'ticket:reviewed'; ticketId: string; ticketTitle: string; action: string; note?: string }
  | { type: 'comment:new'; ticketId: string; ticketTitle: string; authorName: string }
  | { type: 'mention:new'; ticketId: string; ticketTitle: string; authorName: string; commentPreview: string }
  | { type: 'announcement:new'; title: string }
  | { type: 'ticket:deadline'; ticketId: string; ticketTitle: string; dueAt: string }
  | { type: 'board:card:upserted'; cardId: string; actorId: string }
  | { type: 'board:card:deleted'; cardId: string; actorId: string }
  | { type: 'board:card:archived'; cardId: string; actorId: string }
  | { type: 'board:card:restored'; cardId: string; actorId: string }
  | { type: 'board:label:changed'; actorId: string }
  | { type: 'board:comment:new'; cardId: string; commentId: string; authorId: string; authorName: string }
  | { type: 'board:comment:updated'; cardId: string; commentId: string; actorId: string }
  | { type: 'board:comment:deleted'; cardId: string; commentId: string; actorId: string }
  | { type: 'board:card:assigned'; cardId: string; cardTitle: string; assignedByName: string }
  | { type: 'board:mention:new'; cardId: string; commentId: string; authorName: string }
  | { type: 'ping' };

const SSE_TICKET_TTL_MS = 5 * 60 * 1000; // 5 dakika — access token süresiyle eşleşir

@Injectable()
export class EventsService {
  private readonly connections = new Map<string, Set<Subject<MessageEvent>>>();
  private readonly tickets = new Map<string, { memberId: string; expiresAt: number }>();

  generateTicket(memberId: string): string {
    // Süresi dolmuş ticketları temizle
    const now = Date.now();
    for (const [t, entry] of this.tickets) {
      if (entry.expiresAt < now) this.tickets.delete(t);
    }
    const ticket = randomBytes(32).toString('hex');
    this.tickets.set(ticket, { memberId, expiresAt: now + SSE_TICKET_TTL_MS });
    return ticket;
  }

  redeemTicket(ticket: string): string {
    const entry = this.tickets.get(ticket);
    if (!entry) throw new UnauthorizedException('Ticket gecersiz');
    if (entry.expiresAt < Date.now()) {
      this.tickets.delete(ticket);
      throw new UnauthorizedException('Ticket suresi dolmus');
    }
    return entry.memberId;
  }

  addConnection(memberId: string): { observable: Observable<MessageEvent>; subject: Subject<MessageEvent> } {
    const subject = new Subject<MessageEvent>();
    if (!this.connections.has(memberId)) {
      this.connections.set(memberId, new Set());
    }
    this.connections.get(memberId)!.add(subject);
    return { observable: subject.asObservable(), subject };
  }

  removeConnection(memberId: string, subject: Subject<MessageEvent>) {
    const set = this.connections.get(memberId);
    if (!set) return;
    set.delete(subject);
    if (set.size === 0) this.connections.delete(memberId);
  }

  push(memberId: string, payload: SsePayload) {
    const subjects = this.connections.get(memberId);
    if (!subjects) return;
    const msg = { data: JSON.stringify(payload) } as MessageEvent;
    subjects.forEach((s) => s.next(msg));
  }

  broadcast(memberIds: string[], payload: SsePayload) {
    for (const id of memberIds) {
      this.push(id, payload);
    }
  }

  broadcastAll(payload: SsePayload) {
    for (const [, subjects] of this.connections) {
      const msg = { data: JSON.stringify(payload) } as MessageEvent;
      subjects.forEach((s) => s.next(msg));
    }
  }
}
