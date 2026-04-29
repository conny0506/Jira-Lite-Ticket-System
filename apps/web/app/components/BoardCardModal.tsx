'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardCard, BoardCardPriority, BoardChecklistItem, BoardLabel } from '../lib/boardApi';

const LABEL_COLORS = ['#23a4ff', '#00d1b6', '#f0b429', '#e74c3c', '#9b59b6', '#2ecc71', '#1abc9c', '#e67e22'];

const PRIORITY_META: Record<BoardCardPriority, { label: string; color: string; bg: string }> = {
  LOW: { label: 'Düşük', color: '#0a8a3a', bg: 'linear-gradient(135deg,#7be495,#2ecc71)' },
  MEDIUM: { label: 'Orta', color: '#8a5e00', bg: 'linear-gradient(135deg,#ffd86b,#f0b429)' },
  HIGH: { label: 'Yüksek', color: '#7a0e1f', bg: 'linear-gradient(135deg,#ff8e8e,#e74c3c)' },
};

type Props = {
  card: BoardCard;
  labels: BoardLabel[];
  readOnly: boolean;
  onClose: () => void;
  onUpdateCard: (patch: { title?: string; description?: string | null; startAt?: string | null; dueAt?: string | null; hideCompletedChecklist?: boolean; priority?: BoardCardPriority }) => Promise<void>;
  onDeleteCard: () => Promise<void>;
  onSetLabels: (labelIds: string[]) => Promise<void>;
  onCreateLabel: (name: string, color: string) => Promise<BoardLabel | null>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onAddChecklistItem: (text: string) => Promise<void>;
  onUpdateChecklistItem: (itemId: string, patch: { text?: string; done?: boolean }) => Promise<void>;
  onDeleteChecklistItem: (itemId: string) => Promise<void>;
};

function toInputDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function BoardCardModal({
  card,
  labels,
  readOnly,
  onClose,
  onUpdateCard,
  onDeleteCard,
  onSetLabels,
  onCreateLabel,
  onDeleteLabel,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
}: Props) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description ?? '');
  const [startAt, setStartAt] = useState(toInputDate(card.startAt));
  const [dueAt, setDueAt] = useState(toInputDate(card.dueAt));
  const [hideDone, setHideDone] = useState(card.hideCompletedChecklist);
  const [newItemText, setNewItemText] = useState('');
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(LABEL_COLORS[0]);
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Only re-init local state when modal switches to a different card.
  // Re-syncing on every card field change would clobber in-progress typing
  // (e.g. when the debounced description patch returns and updates the card prop).
  useEffect(() => {
    setTitle(card.title);
    setDescription(card.description ?? '');
    setStartAt(toInputDate(card.startAt));
    setDueAt(toInputDate(card.dueAt));
    setHideDone(card.hideCompletedChecklist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeLabelIds = useMemo(() => new Set(card.labels.map((l) => l.label.id)), [card.labels]);

  const visibleChecklist = useMemo(() => {
    const items = [...card.checklist].sort((a, b) => a.position - b.position);
    return hideDone ? items.filter((i) => !i.done) : items;
  }, [card.checklist, hideDone]);

  const totalItems = card.checklist.length;
  const doneItems = card.checklist.filter((i) => i.done).length;

  function scheduleTitle(val: string) {
    setTitle(val);
    if (titleDebounce.current) clearTimeout(titleDebounce.current);
    titleDebounce.current = setTimeout(() => {
      const trimmed = val.trim();
      if (trimmed && trimmed !== card.title) void onUpdateCard({ title: trimmed });
    }, 500);
  }

  function scheduleDescription(val: string) {
    setDescription(val);
    if (descDebounce.current) clearTimeout(descDebounce.current);
    descDebounce.current = setTimeout(() => {
      if (val !== (card.description ?? '')) void onUpdateCard({ description: val || null });
    }, 600);
  }

  function commitDate(field: 'startAt' | 'dueAt', val: string) {
    const iso = val ? new Date(val).toISOString() : null;
    void onUpdateCard({ [field]: iso });
  }

  function toggleLabel(labelId: string) {
    const next = new Set(activeLabelIds);
    if (next.has(labelId)) next.delete(labelId);
    else next.add(labelId);
    void onSetLabels(Array.from(next));
  }

  function toggleHideDone() {
    const next = !hideDone;
    setHideDone(next);
    void onUpdateCard({ hideCompletedChecklist: next });
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    const text = newItemText.trim();
    if (!text) return;
    setNewItemText('');
    await onAddChecklistItem(text);
  }

  async function handleCreateLabel(e: React.FormEvent) {
    e.preventDefault();
    const name = newLabelName.trim();
    if (!name) return;
    const created = await onCreateLabel(name, newLabelColor);
    if (created) {
      setNewLabelName('');
      void onSetLabels([...Array.from(activeLabelIds), created.id]);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        className="boardModalBackdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="boardModal boardModalSplit"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 300, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="boardModalHeader">
            <input
              className="boardModalTitle"
              value={title}
              onChange={(e) => scheduleTitle(e.target.value)}
              disabled={readOnly}
              maxLength={200}
            />
            <button type="button" className="boardModalClose" onClick={onClose} aria-label="Kapat">×</button>
          </header>

          <div className="boardModalContent">
            <div className="boardModalLeft">
              <section className="boardModalRow">
                <span className="boardModalLabel">Öncelik</span>
                <div className="boardPriorityRow">
                  {(['LOW', 'MEDIUM', 'HIGH'] as BoardCardPriority[]).map((p) => {
                    const m = PRIORITY_META[p];
                    const active = (card.priority ?? 'MEDIUM') === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        className={`boardPriorityChoice${active ? ' isActive' : ''}`}
                        style={active ? { background: m.bg, color: m.color, borderColor: 'transparent' } : undefined}
                        onClick={() => { if (!readOnly && !active) void onUpdateCard({ priority: p }); }}
                        disabled={readOnly}
                      >
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="boardModalRow">
                <span className="boardModalLabel">Etiketler</span>
                <div className="boardModalLabelList">
                  {card.labels.map(({ label }) => (
                    <span key={label.id} className="boardLabelChipFull" style={{ background: label.color }}>{label.name}</span>
                  ))}
                  {!readOnly && (
                    <button
                      type="button"
                      className="boardModalChipBtn"
                      onClick={() => setLabelPopoverOpen((v) => !v)}
                    >
                      + Ekle
                    </button>
                  )}
                </div>
                {labelPopoverOpen && !readOnly && (
                  <div className="boardLabelPopover">
                    <div className="boardLabelPopoverHead">
                      <p className="boardLabelPopoverTitle">Mevcut etiketler</p>
                      <button
                        type="button"
                        className="boardLabelPopoverClose"
                        onClick={() => setLabelPopoverOpen(false)}
                        aria-label="Kapat"
                      >×</button>
                    </div>
                    <div className="boardLabelPopoverList">
                      {labels.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Henuz etiket yok</p>}
                      {labels.map((l) => (
                        <div key={l.id} className="boardLabelPopoverItem">
                          <button
                            type="button"
                            className="boardLabelPopoverToggle"
                            style={{ background: l.color }}
                            onClick={() => toggleLabel(l.id)}
                          >
                            {activeLabelIds.has(l.id) ? '✓ ' : ''}{l.name}
                          </button>
                          <button
                            type="button"
                            className="boardLabelPopoverDel"
                            onClick={() => void onDeleteLabel(l.id)}
                            aria-label="Sil"
                          >×</button>
                        </div>
                      ))}
                    </div>
                    <form className="boardLabelPopoverForm" onSubmit={handleCreateLabel}>
                      <input
                        placeholder="Yeni etiket adi"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        maxLength={40}
                      />
                      <div className="boardLabelColors">
                        {LABEL_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className="boardLabelColorSwatch"
                            style={{ background: c, outline: newLabelColor === c ? '2px solid #fff' : 'none' }}
                            onClick={() => setNewLabelColor(c)}
                            aria-label={c}
                          />
                        ))}
                      </div>
                      <button type="submit">Yeni etiket olustur</button>
                    </form>
                  </div>
                )}
              </section>

              <section className="boardModalRow">
                <span className="boardModalLabel">Tarihler</span>
                <div className="boardModalDates">
                  <label>
                    Baslangic
                    <input
                      type="date"
                      value={startAt}
                      disabled={readOnly}
                      onChange={(e) => { setStartAt(e.target.value); commitDate('startAt', e.target.value); }}
                    />
                  </label>
                  <label>
                    Bitis
                    <input
                      type="date"
                      value={dueAt}
                      disabled={readOnly}
                      onChange={(e) => { setDueAt(e.target.value); commitDate('dueAt', e.target.value); }}
                    />
                  </label>
                </div>
              </section>

              <section className="boardModalRow">
                <span className="boardModalLabel">Aciklama</span>
                <textarea
                  className="boardModalDesc"
                  rows={6}
                  value={description}
                  disabled={readOnly}
                  onChange={(e) => scheduleDescription(e.target.value)}
                  placeholder="Bu kartla ilgili notlari buraya ekleyin..."
                  maxLength={5000}
                />
              </section>

              {!readOnly && (
                <footer className="boardModalFooter">
                  <button
                    type="button"
                    className="boardModalDelete"
                    onClick={() => {
                      if (confirm('Bu karti silmek istediginizden emin misiniz?')) void onDeleteCard();
                    }}
                  >
                    Karti Sil
                  </button>
                </footer>
              )}
            </div>

            <aside className="boardModalRight">
              <div className="boardChecklistHeader">
                <span className="boardModalLabel">Check-list</span>
                <span className="boardChecklistProgress">{doneItems}/{totalItems}</span>
                {totalItems > 0 && (
                  <button
                    type="button"
                    className="boardModalChipBtn"
                    onClick={toggleHideDone}
                    disabled={readOnly}
                  >
                    {hideDone ? 'Tamamlananlari goster' : 'Tamamlananlari gizle'}
                  </button>
                )}
              </div>
              <ul className="boardChecklistList">
                {visibleChecklist.map((item) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    readOnly={readOnly}
                    onToggle={(done) => onUpdateChecklistItem(item.id, { done })}
                    onDelete={() => onDeleteChecklistItem(item.id)}
                    onUpdateText={(text) => onUpdateChecklistItem(item.id, { text })}
                  />
                ))}
                {visibleChecklist.length === 0 && (
                  <li className="boardChecklistEmpty">
                    {hideDone && totalItems > 0 ? 'Tum maddeler tamamlandi' : 'Henuz madde yok'}
                  </li>
                )}
              </ul>
              {!readOnly && (
                <form className="boardChecklistAdd" onSubmit={handleAddItem}>
                  <input
                    placeholder="+ Yeni madde ekle"
                    value={newItemText}
                    onChange={(e) => setNewItemText(e.target.value)}
                    maxLength={500}
                  />
                  <button type="submit" disabled={!newItemText.trim()}>Ekle</button>
                </form>
              )}
            </aside>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ChecklistRow({
  item,
  readOnly,
  onToggle,
  onDelete,
  onUpdateText,
}: {
  item: BoardChecklistItem;
  readOnly: boolean;
  onToggle: (done: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onUpdateText: (text: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(item.text);

  useEffect(() => setText(item.text), [item.text]);

  function commit() {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== item.text) void onUpdateText(trimmed);
    else setText(item.text);
  }

  return (
    <li className={`boardChecklistItem${item.done ? ' isDone' : ''}`}>
      <input
        type="checkbox"
        checked={item.done}
        disabled={readOnly}
        onChange={(e) => void onToggle(e.target.checked)}
      />
      {editing ? (
        <input
          className="boardChecklistTextEdit"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setText(item.text); setEditing(false); }
          }}
          autoFocus
        />
      ) : (
        <span
          className="boardChecklistText"
          onClick={() => { if (!readOnly) setEditing(true); }}
        >
          {item.text}
        </span>
      )}
      {!readOnly && (
        <button
          type="button"
          className="boardChecklistDel"
          onClick={() => void onDelete()}
          aria-label="Sil"
        >×</button>
      )}
    </li>
  );
}
