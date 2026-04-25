'use client';

import { memo, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
  LineChart, Line,
  CartesianGrid,
} from 'recharts';

type TicketStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
type Department = 'SOFTWARE' | 'INDUSTRIAL' | 'MECHANICAL' | 'ELECTRICAL_ELECTRONICS';

type ChartTicket = {
  status: TicketStatus;
  priority: TicketPriority;
  completedAt?: string | null;
  dueAt?: string | null;
  assignees: Array<{ member: { departments?: Array<{ department: Department }> } }>;
};

type Props = {
  tickets: ChartTicket[];
};

const DEPT_LABELS: Record<Department, string> = {
  SOFTWARE: 'Yazılım',
  INDUSTRIAL: 'Endüstriyel',
  MECHANICAL: 'Makine',
  ELECTRICAL_ELECTRONICS: 'Elektrik',
};

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  LOW: '#6c757d',
  MEDIUM: '#23a4ff',
  HIGH: '#f0b429',
  CRITICAL: '#e74c3c',
};

const PIE_COLORS = ['#6c757d', '#23a4ff', '#f0b429', '#e74c3c'];

// Stable references — recharts uses referential equality to detect prop changes
const BAR_RADIUS: [number, number, number, number] = [3, 3, 0, 0];
const LINE_DOT = { fill: '#00d1b6', r: 4 };
const CHART_MARGIN = { top: 4, right: 8, left: -20, bottom: 0 };
const TOOLTIP_STYLE = { background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: 12 };
const LEGEND_STYLE = { fontSize: 12 };
const AXIS_TICK = { fontSize: 11, fill: 'var(--muted)' };

export const DashboardCharts = memo(function DashboardCharts({ tickets }: Props) {
  const deptData = useMemo(() => {
    const deptMap: Record<string, { done: number; active: number; late: number }> = {};
    for (const t of tickets) {
      const depts = new Set<string>();
      for (const a of t.assignees) {
        for (const d of a.member.departments ?? []) depts.add(d.department);
      }
      if (depts.size === 0) depts.add('OTHER');
      for (const dept of depts) {
        if (!deptMap[dept]) deptMap[dept] = { done: 0, active: 0, late: 0 };
        if (t.status === 'DONE') {
          deptMap[dept].done++;
          if (t.dueAt && t.completedAt && new Date(t.completedAt) > new Date(t.dueAt)) deptMap[dept].late++;
        } else {
          deptMap[dept].active++;
          if (t.dueAt && new Date(t.dueAt) < new Date()) deptMap[dept].late++;
        }
      }
    }
    return Object.entries(deptMap).map(([dept, vals]) => ({
      name: DEPT_LABELS[dept as Department] ?? dept,
      ...vals,
    }));
  }, [tickets]);

  const prioData = useMemo(() => {
    const prioMap: Partial<Record<TicketPriority, number>> = {};
    for (const t of tickets) prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1;
    return (Object.entries(prioMap) as [TicketPriority, number][]).map(([name, value]) => ({ name, value }));
  }, [tickets]);

  const days = useMemo(() => {
    const today = new Date();
    const result: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit' });
      const count = tickets.filter((t) => {
        if (!t.completedAt) return false;
        const c = new Date(t.completedAt);
        return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() && c.getDate() === d.getDate();
      }).length;
      result.push({ date: dateStr, count });
    }
    return result;
  }, [tickets]);

  return (
    <div className="chartsGrid">
      <div className="chartCard">
        <div className="chartTitle">Departman Bazlı Görev Durumu</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={deptData} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="name" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="done" name="Tamamlandı" fill="#00d1b6" radius={BAR_RADIUS} animationDuration={800} animationBegin={100} />
            <Bar dataKey="active" name="Aktif" fill="#23a4ff" radius={BAR_RADIUS} animationDuration={800} animationBegin={200} />
            <Bar dataKey="late" name="Gecikmiş" fill="#e74c3c" radius={BAR_RADIUS} animationDuration={800} animationBegin={300} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="chartCard">
        <div className="chartTitle">Öncelik Dağılımı</div>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={prioData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
              {prioData.map((entry, i) => (
                <Cell key={entry.name} fill={PRIORITY_COLORS[entry.name as TicketPriority] ?? PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="chartCard chartCardWide">
        <div className="chartTitle">Son 7 Gün Tamamlanan Görevler</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={days} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="date" tick={AXIS_TICK} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Line type="monotone" dataKey="count" name="Tamamlanan" stroke="#00d1b6" strokeWidth={2} dot={LINE_DOT} animationDuration={1000} animationEasing="ease-out" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
