import { Injectable } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';

export type SsePayload =
  | { type: 'ticket:assigned'; ticketId: string; ticketTitle: string; assignedByName: string }
  | { type: 'ticket:reviewed'; ticketId: string; ticketTitle: string; action: string; note?: string }
  | { type: 'comment:new'; ticketId: string; ticketTitle: string; authorName: string }
  | { type: 'mention:new'; ticketId: string; ticketTitle: string; authorName: string; commentPreview: string }
  | { type: 'announcement:new'; title: string }
  | { type: 'ticket:deadline'; ticketId: string; ticketTitle: string; dueAt: string }
  | { type: 'ping' };

@Injectable()
export class EventsService {
  private readonly connections = new Map<string, Set<Subject<MessageEvent>>>();

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
