'use client';

import { useState } from 'react';

type CalendarEvent = {
  date: string;
  type: 'deadline' | 'meeting' | 'leave';
  label: string;
  id: string;
};

export type CalendarNote = {
  id: string;
  date: string;
  content: string;
  createdBy: { id: string; name: string };
};

type Props = {
  events: CalendarEvent[];
  notes?: CalendarNote[];
  canManageNotes?: boolean;
  onAddNote?: (date: string, content: string) => Promise<void>;
  onDeleteNote?: (id: string) => Promise<void>;
};

const TYPE_COLORS = {
  deadline: '#f0b429',
  meeting: '#23a4ff',
  leave: '#00d1b6',
};

const TYPE_LABELS = {
  deadline: '📅 Deadline',
  meeting: '🎥 Toplantı',
  leave: '🏖️ İzin',
};

type NoteModal = {
  day: number;
  dateStr: string;
  notes: CalendarNote[];
};

export function CalendarView({ events, notes = [], canManageNotes, onAddNote, onDeleteNote }: Props) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [noteModal, setNoteModal] = useState<NoteModal | null>(null);
  const [newNoteText, setNewNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const { year, month } = viewDate;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7;

  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthName = new Date(year, month, 1).toLocaleString('tr-TR', { month: 'long', year: 'numeric' });

  const prevMonth = () =>
    setViewDate(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 },
    );
  const nextMonth = () =>
    setViewDate(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 },
    );

  const getEventsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.filter((e) => e.date.startsWith(dateStr));
  };

  const getNotesForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return notes.filter((n) => n.date.startsWith(dateStr));
  };

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

  function openNoteModal(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    setNoteModal({ day, dateStr, notes: getNotesForDay(day) });
    setNewNoteText('');
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteText.trim() || !noteModal || !onAddNote) return;
    setSavingNote(true);
    try {
      await onAddNote(noteModal.dateStr, newNoteText.trim());
      setNewNoteText('');
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteNote(id: string) {
    if (!onDeleteNote) return;
    await onDeleteNote(id);
  }

  const modalNotes = noteModal
    ? notes.filter((n) => n.date.startsWith(noteModal.dateStr))
    : [];

  return (
    <div className="calendarWrapper">
      <div className="calendarHeader">
        <button className="calNavBtn" onClick={prevMonth}>‹</button>
        <span className="calMonthTitle">{monthName}</span>
        <button className="calNavBtn" onClick={nextMonth}>›</button>
      </div>
      <div className="calLegend">
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <span key={type} className="calLegendItem">
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: TYPE_COLORS[type as keyof typeof TYPE_COLORS], marginRight: 4 }} />
            {label}
          </span>
        ))}
        <span className="calLegendItem">
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#a78bfa', marginRight: 4 }} />
          📝 Not
        </span>
      </div>
      <div className="calGrid">
        {weekDays.map((d) => (
          <div key={d} className="calDayHeader">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="calCell calCellEmpty" />;
          const dayEvents = getEventsForDay(day);
          const dayNotes = getNotesForDay(day);
          return (
            <div
              key={day}
              className={`calCell${isToday(day) ? ' calCellToday' : ''}`}
              onClick={() => openNoteModal(day)}
              style={{ cursor: 'pointer' }}
            >
              <span className="calDayNum">{day}</span>
              <div className="calEvents">
                {dayEvents.slice(0, 3).map((ev) => (
                  <div
                    key={ev.id}
                    className="calEventDot"
                    title={`${TYPE_LABELS[ev.type]}: ${ev.label}`}
                    style={{ background: TYPE_COLORS[ev.type] }}
                  >
                    {ev.label.length > 14 ? ev.label.slice(0, 13) + '…' : ev.label}
                  </div>
                ))}
                {dayNotes.slice(0, 1).map((note) => (
                  <div
                    key={note.id}
                    className="calEventDot"
                    title={`Not: ${note.content}`}
                    style={{ background: '#a78bfa' }}
                  >
                    {note.content.length > 14 ? note.content.slice(0, 13) + '…' : note.content}
                  </div>
                ))}
                {dayEvents.length + dayNotes.length > 3 && (
                  <div className="calEventMore">+{dayEvents.length + dayNotes.length - 3} daha</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {noteModal && (
        <div
          className="calNoteOverlay"
          onClick={(e) => { if (e.target === e.currentTarget) setNoteModal(null); }}
        >
          <div className="calNoteModal">
            <div className="calNoteModalHeader">
              <span className="calNoteModalTitle">
                {new Date(noteModal.dateStr + 'T12:00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
              <button type="button" className="calNoteModalClose" onClick={() => setNoteModal(null)}>×</button>
            </div>

            {modalNotes.length === 0 && (
              <p className="calNoteEmpty">Bu gün için not yok.</p>
            )}
            <ul className="calNoteList">
              {modalNotes.map((note) => (
                <li key={note.id} className="calNoteItem">
                  <span className="calNoteContent">{note.content}</span>
                  <span className="calNoteAuthor">— {note.createdBy.name}</span>
                  {canManageNotes && onDeleteNote && (
                    <button
                      type="button"
                      className="calNoteDeleteBtn"
                      onClick={() => void handleDeleteNote(note.id)}
                      aria-label="Notu sil"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {canManageNotes && onAddNote && (
              <form className="calNoteForm" onSubmit={(e) => void handleAddNote(e)}>
                <input
                  className="calNoteInput"
                  placeholder="Yeni not ekle..."
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  maxLength={500}
                  autoFocus
                />
                <button
                  type="submit"
                  className="calNoteSubmitBtn"
                  disabled={!newNoteText.trim() || savingNote}
                >
                  {savingNote ? '...' : 'Ekle'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
