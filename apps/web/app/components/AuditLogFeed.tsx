'use client';

type AuditLog = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string; role: string };
};

type Props = {
  logs: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  loading: boolean;
};

const ACTION_ICONS: Record<string, string> = {
  CREATE_TICKET: '🟢',
  DELETE_TICKET: '🔴',
  UPDATE_STATUS: '🔄',
  CREATE_SUBMISSION: '📎',
  DELETE_SUBMISSION: '🗑️',
};

const ACTION_LABELS: Record<string, string> = {
  CREATE_TICKET: 'Görev oluşturdu',
  DELETE_TICKET: 'Görevi sildi',
  UPDATE_STATUS: 'Durum güncelledi',
  CREATE_SUBMISSION: 'Dosya yükledi',
  DELETE_SUBMISSION: 'Dosyayı sildi',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function metaDetail(log: AuditLog): string {
  if (!log.metadata) return '';
  const m = log.metadata as Record<string, unknown>;
  if (log.action === 'UPDATE_STATUS') return `→ ${m.status}`;
  if (log.action === 'CREATE_TICKET' || log.action === 'DELETE_TICKET') return `"${m.title}"`;
  return '';
}

export function AuditLogFeed({ logs, total, page, pageSize, onPageChange, loading }: Props) {
  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="auditFeed">
      {loading && <div style={{ color: 'var(--muted)', padding: 16 }}>Yükleniyor...</div>}
      {!loading && logs.length === 0 && (
        <div style={{ color: 'var(--muted)', padding: 16 }}>Henüz aktivite yok.</div>
      )}
      {logs.map((log) => (
        <div key={log.id} className="auditEntry">
          <span className="auditIcon">{ACTION_ICONS[log.action] ?? '📝'}</span>
          <div className="auditBody">
            <span className="auditActor">{log.actor.name}</span>
            {' '}
            <span className="auditAction">{ACTION_LABELS[log.action] ?? log.action}</span>
            {' '}
            <span className="auditMeta">{metaDetail(log)}</span>
          </div>
          <span className="auditDate">{formatDate(log.createdAt)}</span>
        </div>
      ))}
      {totalPages > 1 && (
        <div className="auditPagination">
          <button className="calNavBtn" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>‹</button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>{page} / {totalPages}</span>
          <button className="calNavBtn" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>›</button>
        </div>
      )}
    </div>
  );
}
