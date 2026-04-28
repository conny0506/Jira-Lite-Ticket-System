'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DragEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import {
  BoardApiError,
  BoardAuthBundle,
  BoardCard,
  BoardCardStatus,
  BoardLabel,
  boardFetch,
} from '../lib/boardApi';
import { BoardCardModal } from './BoardCardModal';

const COLUMNS: { status: BoardCardStatus; label: string; accent: string }[] = [
  { status: 'TODO', label: 'To Do', accent: '#23a4ff' },
  { status: 'IN_PROGRESS', label: 'In Progress', accent: '#f0b429' },
  { status: 'DONE', label: 'Done', accent: '#00d1b6' },
];

type Props = {
  bundle: BoardAuthBundle;
  readOnly: boolean;
  onAuthError: () => void;
};

type Toast = { kind: 'success' | 'error'; msg: string } | null;

export function BoardView({ bundle, readOnly, onAuthError }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const [loading, setLoading] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<BoardCardStatus | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<BoardCardStatus | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<string | null>(null);

  const showToast = useCallback((kind: 'success' | 'error', msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 2400);
  }, []);

  const handleApiError = useCallback(
    (err: unknown, fallback: string) => {
      if (err instanceof BoardApiError && err.status === 401) {
        onAuthError();
        return;
      }
      const msg = err instanceof Error ? err.message : fallback;
      showToast('error', msg);
    },
    [onAuthError, showToast],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cardsRes, labelsRes] = await Promise.all([
          boardFetch<BoardCard[]>(bundle, '/board/cards'),
          boardFetch<BoardLabel[]>(bundle, '/board/labels'),
        ]);
        if (cancelled) return;
        setCards(cardsRes);
        setLabels(labelsRes);
      } catch (err) {
        handleApiError(err, 'Veriler yuklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bundle, handleApiError]);

  async function handleCreateCard(e: FormEvent, status: BoardCardStatus) {
    e.preventDefault();
    const title = newCardTitle.trim();
    if (!title) return;
    setNewCardTitle('');
    setAddingTo(null);
    try {
      const card = await boardFetch<BoardCard>(bundle, '/board/cards', {
        method: 'POST',
        body: JSON.stringify({ title, status }),
      });
      setCards((prev) => [...prev, card]);
      setRecentlyCreatedId(card.id);
      setTimeout(() => setRecentlyCreatedId(null), 600);
    } catch (err) {
      handleApiError(err, 'Kart olusturulamadi');
    }
  }

  async function handleMoveCard(cardId: string, status: BoardCardStatus) {
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === status) return;
    const positionInTarget = cards.filter((c) => c.status === status).length;
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, status, position: positionInTarget } : c)),
    );
    try {
      await boardFetch(bundle, `/board/cards/${cardId}/move`, {
        method: 'PATCH',
        body: JSON.stringify({ status, position: positionInTarget }),
      });
    } catch (err) {
      handleApiError(err, 'Kart tasinamadi');
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, status: card.status, position: card.position } : c)),
      );
    }
  }

  async function patchCard(cardId: string, patch: Record<string, unknown>) {
    try {
      const updated = await boardFetch<BoardCard>(bundle, `/board/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    } catch (err) {
      handleApiError(err, 'Kart guncellenemedi');
    }
  }

  async function deleteCard(cardId: string) {
    try {
      await boardFetch(bundle, `/board/cards/${cardId}`, { method: 'DELETE' });
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setOpenCardId(null);
      showToast('success', 'Kart silindi');
    } catch (err) {
      handleApiError(err, 'Kart silinemedi');
    }
  }

  async function setCardLabels(cardId: string, labelIds: string[]) {
    try {
      const updated = await boardFetch<BoardCard>(bundle, `/board/cards/${cardId}/labels`, {
        method: 'PUT',
        body: JSON.stringify({ labelIds }),
      });
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    } catch (err) {
      handleApiError(err, 'Etiket guncellenemedi');
    }
  }

  async function createLabel(name: string, color: string): Promise<BoardLabel | null> {
    try {
      const label = await boardFetch<BoardLabel>(bundle, '/board/labels', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      });
      setLabels((prev) => [...prev, label]);
      return label;
    } catch (err) {
      handleApiError(err, 'Etiket olusturulamadi');
      return null;
    }
  }

  async function deleteLabel(labelId: string) {
    try {
      await boardFetch(bundle, `/board/labels/${labelId}`, { method: 'DELETE' });
      setLabels((prev) => prev.filter((l) => l.id !== labelId));
      setCards((prev) =>
        prev.map((c) => ({ ...c, labels: c.labels.filter((cl) => cl.label.id !== labelId) })),
      );
    } catch (err) {
      handleApiError(err, 'Etiket silinemedi');
    }
  }

  async function addChecklistItem(cardId: string, text: string) {
    try {
      const item = await boardFetch<BoardCard['checklist'][number]>(bundle, `/board/cards/${cardId}/checklist`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      });
      setCards((prev) =>
        prev.map((c) => (c.id === cardId ? { ...c, checklist: [...c.checklist, item] } : c)),
      );
    } catch (err) {
      handleApiError(err, 'Madde eklenemedi');
    }
  }

  async function updateChecklistItem(cardId: string, itemId: string, patch: { text?: string; done?: boolean }) {
    try {
      const item = await boardFetch<BoardCard['checklist'][number]>(bundle, `/board/checklist/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId
            ? { ...c, checklist: c.checklist.map((i) => (i.id === itemId ? item : i)) }
            : c,
        ),
      );
    } catch (err) {
      handleApiError(err, 'Madde guncellenemedi');
    }
  }

  async function deleteChecklistItem(cardId: string, itemId: string) {
    try {
      await boardFetch(bundle, `/board/checklist/${itemId}`, { method: 'DELETE' });
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, checklist: c.checklist.filter((i) => i.id !== itemId) } : c,
        ),
      );
    } catch (err) {
      handleApiError(err, 'Madde silinemedi');
    }
  }

  function handleDragStart(e: DragEvent, cardId: string) {
    if (readOnly) return;
    e.dataTransfer.setData('boardCardId', cardId);
    setDraggingId(cardId);
  }

  function handleDrop(e: DragEvent, status: BoardCardStatus) {
    e.preventDefault();
    setOverColumn(null);
    setDraggingId(null);
    if (readOnly) return;
    const cardId = e.dataTransfer.getData('boardCardId');
    if (cardId) void handleMoveCard(cardId, status);
  }

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null;

  return (
    <div className="boardShell">
      {toast && (
        <div className={`boardToast boardToast-${toast.kind}`}>{toast.msg}</div>
      )}
      <div className="boardColumns">
        {COLUMNS.map((col, colIndex) => {
          const colCards = cards
            .filter((c) => c.status === col.status)
            .sort((a, b) => a.position - b.position);
          const isOver = overColumn === col.status;
          return (
            <motion.section
              key={col.status}
              className="boardColumn"
              data-over={isOver ? 'true' : 'false'}
              style={{ borderTop: `3px solid ${col.accent}` }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: colIndex * 0.08, ease: 'easeOut' }}
              onDragOver={(e) => { if (!readOnly) { e.preventDefault(); setOverColumn(col.status); } }}
              onDragLeave={() => setOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.status)}
            >
              <header className="boardColumnHeader">
                <span style={{ color: col.accent }}>{col.label}</span>
                <span className="boardColumnCount">{colCards.length}</span>
              </header>

              <div className="boardCardList">
                <AnimatePresence>
                  {colCards.map((card) => (
                    <motion.article
                      key={card.id}
                      layout
                      className={`boardCard${recentlyCreatedId === card.id ? ' isNew' : ''}`}
                      style={{ opacity: draggingId === card.id ? 0.4 : 1 }}
                      initial={{ opacity: 0, scale: 0.9, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.85, x: 30 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                      whileHover={readOnly ? undefined : { y: -3 }}
                      draggable={!readOnly}
                      onDragStart={(e) => handleDragStart(e as unknown as DragEvent, card.id)}
                      onDragEnd={() => { setDraggingId(null); setOverColumn(null); }}
                      onClick={() => setOpenCardId(card.id)}
                    >
                      {card.labels.length > 0 && (
                        <div className="boardCardLabels">
                          {card.labels.map(({ label }) => (
                            <span
                              key={label.id}
                              className="boardLabelChip"
                              title={label.name}
                              style={{ background: label.color }}
                            />
                          ))}
                        </div>
                      )}
                      <h3 className="boardCardTitle">{card.title}</h3>
                      <div className="boardCardMeta">
                        {card.dueAt && (
                          <span className="boardCardMetaItem" title="Bitis">
                            📅 {new Date(card.dueAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                          </span>
                        )}
                        {card.checklist.length > 0 && (
                          <span className="boardCardMetaItem" title="Check-list">
                            ☑ {card.checklist.filter((i) => i.done).length}/{card.checklist.length}
                          </span>
                        )}
                      </div>
                    </motion.article>
                  ))}
                </AnimatePresence>

                {!readOnly && addingTo === col.status && (
                  <form className="boardAddCardForm" onSubmit={(e) => handleCreateCard(e, col.status)}>
                    <input
                      autoFocus
                      placeholder="Kart basligi..."
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTo(null); setNewCardTitle(''); } }}
                      maxLength={200}
                    />
                    <div className="boardAddCardActions">
                      <button type="submit">Ekle</button>
                      <button type="button" onClick={() => { setAddingTo(null); setNewCardTitle(''); }}>İptal</button>
                    </div>
                  </form>
                )}

                {!readOnly && addingTo !== col.status && (
                  <button
                    type="button"
                    className="boardAddCardBtn"
                    onClick={() => { setAddingTo(col.status); setNewCardTitle(''); }}
                  >
                    + Kart Ekle
                  </button>
                )}

                {colCards.length === 0 && readOnly && (
                  <p className="muted" style={{ textAlign: 'center', fontSize: 13, padding: '12px 0' }}>Bu kolonda kart yok</p>
                )}
              </div>
            </motion.section>
          );
        })}
      </div>

      {loading && <p className="muted" style={{ textAlign: 'center' }}>Yukleniyor...</p>}

      <AnimatePresence>
        {openCard && (
          <BoardCardModal
            key={openCard.id}
            card={openCard}
            labels={labels}
            readOnly={readOnly}
            onClose={() => setOpenCardId(null)}
            onUpdateCard={(patch) => patchCard(openCard.id, patch)}
            onDeleteCard={() => deleteCard(openCard.id)}
            onSetLabels={(ids) => setCardLabels(openCard.id, ids)}
            onCreateLabel={createLabel}
            onDeleteLabel={deleteLabel}
            onAddChecklistItem={(text) => addChecklistItem(openCard.id, text)}
            onUpdateChecklistItem={(itemId, patch) => updateChecklistItem(openCard.id, itemId, patch)}
            onDeleteChecklistItem={(itemId) => deleteChecklistItem(openCard.id, itemId)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
