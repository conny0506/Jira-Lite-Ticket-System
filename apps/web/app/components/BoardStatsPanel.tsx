'use client';

import { motion } from 'framer-motion';
import { useEffect, useMemo } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BoardCard } from '../lib/boardApi';

type Props = {
  cards: BoardCard[];
  onClose: () => void;
};

const STATUS_LABEL: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  TODO: '#23a4ff',
  IN_PROGRESS: '#f0b429',
  DONE: '#00d1b6',
};
const PRIORITY_LABEL: Record<string, string> = { LOW: 'Düşük', MEDIUM: 'Orta', HIGH: 'Yüksek' };
const PRIORITY_COLOR: Record<string, string> = { LOW: '#2ecc71', MEDIUM: '#f0b429', HIGH: '#e74c3c' };

export function BoardStatsPanel({ cards, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stats = useMemo(() => {
    const total = cards.length;
    const byStatus = (['TODO', 'IN_PROGRESS', 'DONE'] as const).map((s) => ({
      name: STATUS_LABEL[s],
      value: cards.filter((c) => c.status === s).length,
      key: s,
    }));
    const byPriority = (['LOW', 'MEDIUM', 'HIGH'] as const).map((p) => ({
      name: PRIORITY_LABEL[p],
      value: cards.filter((c) => (c.priority ?? 'MEDIUM') === p).length,
      key: p,
    }));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
    const dueDist = [
      { name: 'Gecikmiş', value: cards.filter((c) => c.dueAt && new Date(c.dueAt) < today).length, color: '#e74c3c' },
      { name: 'Bugün', value: cards.filter((c) => c.dueAt && new Date(c.dueAt) >= today && new Date(c.dueAt) < tomorrow).length, color: '#f0b429' },
      { name: 'Bu hafta', value: cards.filter((c) => c.dueAt && new Date(c.dueAt) >= tomorrow && new Date(c.dueAt) < weekEnd).length, color: '#23a4ff' },
      { name: 'Sonra', value: cards.filter((c) => c.dueAt && new Date(c.dueAt) >= weekEnd).length, color: '#9b59b6' },
      { name: 'Tarihsiz', value: cards.filter((c) => !c.dueAt).length, color: '#7f8c8d' },
    ];
    const totalChecklistItems = cards.reduce((acc, c) => acc + c.checklist.length, 0);
    const doneChecklistItems = cards.reduce((acc, c) => acc + c.checklist.filter((i) => i.done).length, 0);
    const checklistPct = totalChecklistItems > 0 ? Math.round((doneChecklistItems / totalChecklistItems) * 100) : 0;
    const donePct = total > 0 ? Math.round((cards.filter((c) => c.status === 'DONE').length / total) * 100) : 0;
    const totalAssigned = cards.filter((c) => c.assignees.length > 0).length;
    const totalUnassigned = total - totalAssigned;
    const totalLabels = cards.filter((c) => c.labels.length > 0).length;
    return { total, byStatus, byPriority, dueDist, checklistPct, donePct, totalAssigned, totalUnassigned, totalLabels };
  }, [cards]);

  return (
    <motion.div
      className="boardModalBackdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="boardStatsPanel"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="boardModalHeader">
          <h2 className="boardArchiveTitle">📊 Pano İstatistikleri</h2>
          <button type="button" className="boardModalClose" onClick={onClose} aria-label="Kapat">×</button>
        </header>

        <div className="boardStatsBody">
          <div className="boardStatsKpis">
            <div className="boardStatsKpi">
              <span className="boardStatsKpiVal">{stats.total}</span>
              <span className="boardStatsKpiLbl">Toplam Kart</span>
            </div>
            <div className="boardStatsKpi">
              <span className="boardStatsKpiVal">{stats.donePct}%</span>
              <span className="boardStatsKpiLbl">Tamamlanma</span>
            </div>
            <div className="boardStatsKpi">
              <span className="boardStatsKpiVal">{stats.checklistPct}%</span>
              <span className="boardStatsKpiLbl">Checklist Doluluk</span>
            </div>
            <div className="boardStatsKpi">
              <span className="boardStatsKpiVal">{stats.totalAssigned}</span>
              <span className="boardStatsKpiLbl">Atanmış Kart</span>
            </div>
          </div>

          <div className="boardStatsChartGrid">
            <div className="boardStatsChartCard">
              <h3 className="boardStatsChartTitle">Sütun Dağılımı</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats.byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                    {stats.byStatus.map((s) => (
                      <Cell key={s.key} fill={STATUS_COLOR[s.key]} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'rgba(20,24,34,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="boardStatsLegend">
                {stats.byStatus.map((s) => (
                  <span key={s.key}>
                    <span className="boardStatsLegendDot" style={{ background: STATUS_COLOR[s.key] }} />
                    {s.name}: <strong>{s.value}</strong>
                  </span>
                ))}
              </div>
            </div>

            <div className="boardStatsChartCard">
              <h3 className="boardStatsChartTitle">Öncelik Dağılımı</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.byPriority}>
                  <XAxis dataKey="name" tick={{ fill: '#aec0df', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#aec0df', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'rgba(20,24,34,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {stats.byPriority.map((p) => (
                      <Cell key={p.key} fill={PRIORITY_COLOR[p.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="boardStatsChartCard boardStatsChartCard-wide">
              <h3 className="boardStatsChartTitle">Tarih Dağılımı</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.dueDist}>
                  <XAxis dataKey="name" tick={{ fill: '#aec0df', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} />
                  <YAxis tick={{ fill: '#aec0df', fontSize: 12 }} axisLine={{ stroke: 'rgba(255,255,255,0.1)' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: 'rgba(20,24,34,0.95)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {stats.dueDist.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
