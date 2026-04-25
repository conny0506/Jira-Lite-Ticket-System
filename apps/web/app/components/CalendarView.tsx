'use client';

import { useState } from 'react';

type CalendarEvent = {
  date: string; // ISO date string
  type: 'deadline' | 'meeting' | 'leave';
  label: string;
  id: string;
};

type Props = {
  events: CalendarEvent[];
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

export function CalendarView({ events }: Props) {
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const { year, month } = viewDate;
  const firstDay = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay + 6) % 7; // Make Monday=0

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

  const today = new Date();
  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

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
      </div>
      <div className="calGrid">
        {weekDays.map((d) => (
          <div key={d} className="calDayHeader">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="calCell calCellEmpty" />;
          const dayEvents = getEventsForDay(day);
          return (
            <div key={day} className={`calCell${isToday(day) ? ' calCellToday' : ''}`}>
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
                {dayEvents.length > 3 && (
                  <div className="calEventMore">+{dayEvents.length - 3} daha</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
