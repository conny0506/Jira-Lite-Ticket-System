'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { BoardActivityLog, BoardAuthBundle } from '../lib/boardApi';
import { boardFetch } from '../lib/boardApi';

const ACTION_LABELS: Record<string, string> = {
  BOARD_CARD_CREATE: 'oluşturdu',
  BOARD_CARD_DUPLICATE: 'kopyaladı',
  BOARD_CARD_MOVE: 'taşıdı',
  BOARD_CARD_DELETE: 'sildi',
  BOARD_CARD_BULK_DELETE: 'toplu sildi',
  BOARD_CARD_ARCHIVE: 'arşivledi',
  BOARD_CARD_RESTORE: 'geri yükledi',
  BOARD_CARD_ASSIGN: 'atama yaptı',
  BOARD_COMMENT_CREATE: 'yorum yaptı',
};

const ACTION_ICONS: Record<string, string> = {
  BOARD_CARD_CREATE: '✨',
  BOARD_CARD_DUPLICATE: '📋',
  BOARD_CARD_MOVE: '🔀',
  BOARD_CARD_DELETE: '🗑',
  BOARD_CARD_BULK_DELETE: '🗑',
  BOARD_CARD_ARCHIVE: '📦',
  BOARD_CARD_RESTORE: '↩',
  BOARD_CARD_ASSIGN: '👥',
  BOARD_COMMENT_CREATE: '💬',
};

type Props = {
  bundle: BoardAuthBundle;
  cardId: string;
  onError: (msg: string) => void;
};

export function BoardActivityFeed({ bundle, cardId, onError }: Props) {
  const [logs, setLogs] = useState<BoardActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    boardFetch<BoardActivityLog[]>(bundle, `/board/cards/${cardId}/activity`)
      .then((res) => { if (!cancelled) setLogs(res); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Aktivite yüklenemedi'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bundle, cardId, onError]);

  return (
    <div className="boardActivityFeed">
      {loading && <p className="muted boardActivityLoading">Yükleniyor...</p>}
      {!loading && logs.length === 0 && (
        <p className="muted boardActivityEmpty">Henüz aktivite yok</p>
      )}
      <ul className="boardActivityList">
        {logs.map((log, idx) => (
          <motion.li
            key={log.id}
            className="boardActivityItem"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22, delay: Math.min(idx, 8) * 0.03 }}
          >
            <span className="boardActivityIcon">{ACTION_ICONS[log.action] ?? '•'}</span>
            <div className="boardActivityBody">
              <span className="boardActivityLine">
                <strong>{log.actor.name}</strong> {ACTION_LABELS[log.action] ?? log.action.toLowerCase()}
              </span>
              <span className="boardActivityTime">
                {new Date(log.createdAt).toLocaleString('tr-TR', {
                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                })}
              </span>
            </div>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}
