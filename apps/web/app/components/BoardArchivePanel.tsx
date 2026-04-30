'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { BoardAuthBundle, BoardCard } from '../lib/boardApi';
import { boardFetch } from '../lib/boardApi';

type Props = {
  bundle: BoardAuthBundle;
  readOnly: boolean;
  onClose: () => void;
  onRestore: (card: BoardCard) => void;
  onError: (msg: string) => void;
};

export function BoardArchivePanel({ bundle, readOnly, onClose, onRestore, onError }: Props) {
  const [archived, setArchived] = useState<BoardCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    boardFetch<BoardCard[]>(bundle, '/board/archived')
      .then((res) => { if (!cancelled) setArchived(res); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Arşiv yüklenemedi'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bundle, onError]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleRestore(card: BoardCard) {
    try {
      const restored = await boardFetch<BoardCard>(bundle, `/board/cards/${card.id}/restore`, { method: 'PATCH' });
      setArchived((prev) => prev.filter((c) => c.id !== card.id));
      onRestore(restored);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Geri yüklenemedi');
    }
  }

  async function handlePermDelete(card: BoardCard) {
    if (!confirm(`"${card.title}" kalıcı olarak silinsin mi? Bu geri alınamaz.`)) return;
    try {
      await boardFetch(bundle, `/board/cards/${card.id}`, { method: 'DELETE' });
      setArchived((prev) => prev.filter((c) => c.id !== card.id));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Silinemedi');
    }
  }

  return (
    <motion.div
      className="boardModalBackdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="boardArchivePanel"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 300, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="boardModalHeader">
          <h2 className="boardArchiveTitle">📦 Arşivlenmiş Kartlar</h2>
          <span className="boardArchiveCount">{archived.length}</span>
          <button type="button" className="boardModalClose" onClick={onClose} aria-label="Kapat">×</button>
        </header>

        <div className="boardArchiveBody">
          {loading && <p className="muted">Yükleniyor...</p>}
          {!loading && archived.length === 0 && (
            <p className="muted boardArchiveEmpty">Arşivde kart yok</p>
          )}
          <ul className="boardArchiveList">
            <AnimatePresence>
              {archived.map((card) => (
                <motion.li
                  key={card.id}
                  layout
                  className="boardArchiveItem"
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 30 }}
                  transition={{ duration: 0.22 }}
                >
                  <div className="boardArchiveItemBody">
                    <span className="boardArchiveSeq">BOARD-{card.seq}</span>
                    <span className="boardArchiveCardTitle">{card.title}</span>
                    {card.archivedAt && (
                      <span className="boardArchiveDate">
                        {new Date(card.archivedAt).toLocaleDateString('tr-TR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <div className="boardArchiveActions">
                      <button type="button" onClick={() => handleRestore(card)} className="boardArchiveRestoreBtn">
                        ↩ Geri Yükle
                      </button>
                      <button type="button" onClick={() => handlePermDelete(card)} className="boardArchiveDeleteBtn">
                        Kalıcı Sil
                      </button>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </motion.div>
    </motion.div>
  );
}
