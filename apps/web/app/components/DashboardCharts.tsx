'use client';

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

export function DashboardCharts({ tickets }: Props) {
  // Department bar chart data
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
  const deptData = Object.entries(deptMap).map(([dept, vals]) => ({
    name: DEPT_LABELS[dept as Department] ?? dept,
    ...vals,
  }));

  // Priority pie data
  const prioMap: Partial<Record<TicketPriority, number>> = {};
  for (const t of tickets) prioMap[t.priority] = (prioMap[t.priority] ?? 0) + 1;
  const prioData = (Object.entries(prioMap) as [TicketPriority, number][]).map(([name, value]) => ({ name, value }));

  // Last 7 days completion line chart
  const today = new Date();
  const days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toLocaleDateString('tr-TR', { weekday: 'short', day: '2-digit' });
    const count = tickets.filter((t) => {
      if (!t.completedAt) return false;
      const c = new Date(t.completedAt);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth() && c.getDate() === d.getDate();
    }).length;
    days.push({ date: dateStr, count });
  }

  return (
    <div className="chartsGrid">
      <div className="chartCard">
        <div className="chartTitle">Departman Bazlı Görev Durumu</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={deptData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="done" name="Tamamlandı" fill="#00d1b6" radius={[3, 3, 0, 0]} />
            <Bar dataKey="active" name="Aktif" fill="#23a4ff" radius={[3, 3, 0, 0]} />
            <Bar dataKey="late" name="Gecikmiş" fill="#e74c3c" radius={[3, 3, 0, 0]} />
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
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <div className="chartCard chartCardWide">
        <div className="chartTitle">Son 7 Gün Tamamlanan Görevler</div>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={days} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} allowDecimals={false} />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--line)', color: 'var(--text)', fontSize: 12 }} />
            <Line type="monotone" dataKey="count" name="Tamamlanan" stroke="#00d1b6" strokeWidth={2} dot={{ fill: '#00d1b6', r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
