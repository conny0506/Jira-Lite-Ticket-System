'use client';

import { DragEvent, useState } from 'react';
import { motion } from 'framer-motion';

type TicketStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

type KanbanTicket = {
  id: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  dueAt?: string | null;
  assignees: Array<{ member: { id: string; name: string } }>;
  dependencies?: Array<{ dependsOn: { id: string; title: string; status: TicketStatus } }>;
};

type Props = {
  tickets: KanbanTicket[];
  onStatusChange: (ticketId: string, status: TicketStatus) => void;
};

const COLUMNS: { status: TicketStatus; label: string; color: string }[] = [
  { status: 'TODO', label: 'Bekliyor', color: '#6c757d' },
  { status: 'IN_PROGRESS', label: 'Devam Ediyor', color: '#23a4ff' },
  { status: 'IN_REVIEW', label: 'İncelemede', color: '#f0b429' },
  { status: 'DONE', label: 'Tamamlandı', color: '#00d1b6' },
];

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: '#6c757d',
  MEDIUM: '#23a4ff',
  HIGH: '#f0b429',
  CRITICAL: '#e74c3c',
};

export function KanbanBoard({ tickets, onStatusChange }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<TicketStatus | null>(null);

  const handleDragStart = (e: DragEvent, ticketId: string) => {
    e.dataTransfer.setData('ticketId', ticketId);
    setDraggingId(ticketId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setOverColumn(null);
  };

  const handleDrop = (e: DragEvent, status: TicketStatus) => {
    e.preventDefault();
    const ticketId = e.dataTransfer.getData('ticketId');
    if (ticketId) onStatusChange(ticketId, status);
    setOverColumn(null);
  };

  const handleDragOver = (e: DragEvent, status: TicketStatus) => {
    e.preventDefault();
    setOverColumn(status);
  };

  return (
    <div className="kanbanBoard">
      {COLUMNS.map((col) => {
        const colTickets = tickets.filter((t) => t.status === col.status);
        const isOver = overColumn === col.status;
        const colIndex = COLUMNS.indexOf(col);
        return (
          <motion.div
            key={col.status}
            className="kanbanColumn"
            style={{ borderTop: `3px solid ${col.color}`, background: isOver ? 'var(--hover)' : undefined }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: colIndex * 0.08, ease: 'easeOut' }}
            onDrop={(e) => handleDrop(e, col.status)}
            onDragOver={(e) => handleDragOver(e, col.status)}
            onDragLeave={() => setOverColumn(null)}
          >
            <div className="kanbanColumnHeader">
              <span style={{ color: col.color, fontWeight: 700 }}>{col.label}</span>
              <span className="kanbanCount">{colTickets.length}</span>
            </div>
            <div className="kanbanCards">
              {colTickets.map((ticket) => {
                const hasBlocker = ticket.dependencies?.some(
                  (d) => d.dependsOn.status !== 'DONE',
                );
                return (
                  <div
                    key={ticket.id}
                    className="kanbanCard"
                    draggable
                    onDragStart={(e) => handleDragStart(e, ticket.id)}
                    onDragEnd={handleDragEnd}
                    style={{ opacity: draggingId === ticket.id ? 0.5 : 1 }}
                  >
                    <div className="kanbanCardTitle">{ticket.title}</div>
                    <div className="kanbanCardMeta">
                      <span
                        className="priorityBadge"
                        style={{ background: PRIORITY_COLORS[ticket.priority], color: '#fff', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
                      >
                        {ticket.priority}
                      </span>
                      {hasBlocker && (
                        <span title="Tamamlanmamış bağımlılık var" style={{ color: '#f0b429', fontSize: 14 }}>⛓️</span>
                      )}
                      {ticket.dueAt && (
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                          {new Date(ticket.dueAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                        </span>
                      )}
                    </div>
                    {ticket.assignees.length > 0 && (
                      <div className="kanbanAssignees">
                        {ticket.assignees.slice(0, 3).map((a) => (
                          <span key={a.member.id} className="kanbanAvatar" title={a.member.name}>
                            {a.member.name.charAt(0).toUpperCase()}
                          </span>
                        ))}
                        {ticket.assignees.length > 3 && (
                          <span className="kanbanAvatar">+{ticket.assignees.length - 3}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {colTickets.length === 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
                  Görev yok
                </div>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
