'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardAuthBundle, BoardCard, BoardCardPriority, BoardChecklistItem, BoardLabel, BoardMember } from '../lib/boardApi';
import { BoardActivityFeed } from './BoardActivityFeed';
import { BoardCommentPanel } from './BoardCommentPanel';

const LABEL_COLORS = ['#23a4ff', '#00d1b6', '#f0b429', '#e74c3c', '#9b59b6', '#2ecc71', '#1abc9c', '#e67e22'];
const COVER_COLORS = ['', '#23a4ff', '#00d1b6', '#f0b429', '#e74c3c', '#9b59b6', '#2ecc71', '#e67e22', '#34495e'];

const PRIORITY_META: Record<BoardCardPriority, { label: string; color: string; bg: string }> = {
  LOW: { label: 'Düşük', color: '#0a8a3a', bg: 'linear-gradient(135deg,#7be495,#2ecc71)' },
  MEDIUM: { label: 'Orta', color: '#8a5e00', bg: 'linear-gradient(135deg,#ffd86b,#f0b429)' },
  HIGH: { label: 'Yüksek', color: '#7a0e1f', bg: 'linear-gradient(135deg,#ff8e8e,#e74c3c)' },
};

type SaveStatus = 'idle' | 'saving' | 'saved';
type SideTab = 'checklist' | 'comments' | 'activity';

type Props = {
  card: BoardCard;
  labels: BoardLabel[];
  members: BoardMember[];
  bundle: BoardAuthBundle;
  currentUserId: string;
  readOnly: boolean;
  onClose: () => void;
  onUpdateCard: (patch: { title?: string; description?: string | null; startAt?: string | null; dueAt?: string | null; hideCompletedChecklist?: boolean; priority?: BoardCardPriority; coverColor?: string | null }) => Promise<void>;
  onDeleteCard: () => Promise<void>;
  onArchiveCard?: () => Promise<void>;
  onDuplicateCard?: () => Promise<void>;
  onSetLabels: (labelIds: string[]) => Promise<void>;
  onSetAssignees: (memberIds: string[]) => Promise<void>;
  onCreateLabel: (name: string, color: string) => Promise<BoardLabel | null>;
  onDeleteLabel: (labelId: string) => Promise<void>;
  onAddChecklistItem: (text: string) => Promise<void>;
  onUpdateChecklistItem: (itemId: string, patch: { text?: string; done?: boolean }) => Promise<void>;
  onDeleteChecklistItem: (itemId: string) => Promise<void>;
  onError: (msg: string) => void;
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
  members,
  bundle,
  currentUserId,
  readOnly,
  onClose,
  onUpdateCard,
  onDeleteCard,
  onArchiveCard,
  onDuplicateCard,
  onSetLabels,
  onSetAssignees,
  onCreateLabel,
  onDeleteLabel,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onError,
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [sideTab, setSideTab] = useState<SideTab>('checklist');
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const titleDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const descDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runUpdate = useCallback(
    async (patch: Parameters<Props['onUpdateCard']>[0]) => {
      setSaveStatus('saving');
      try {
        await onUpdateCard(patch);
        setSaveStatus('saved');
        if (savedClearTimer.current) clearTimeout(savedClearTimer.current);
        savedClearTimer.current = setTimeout(() => setSaveStatus('idle'), 1800);
      } catch {
        setSaveStatus('idle');
      }
    },
    [onUpdateCard],
  );

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
      if (e.key === 'Escape') {
        flushPending();
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        flushPending();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        flushPending();
        onClose();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, title, description, card.id]);

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
      if (trimmed && trimmed !== card.title) void runUpdate({ title: trimmed });
    }, 500);
  }

  function scheduleDescription(val: string) {
    setDescription(val);
    if (descDebounce.current) clearTimeout(descDebounce.current);
    descDebounce.current = setTimeout(() => {
      if (val !== (card.description ?? '')) void runUpdate({ description: val || null });
    }, 600);
  }

  function commitDate(field: 'startAt' | 'dueAt', val: string) {
    const iso = val ? new Date(val).toISOString() : null;
    void runUpdate({ [field]: iso });
  }

  function flushPending() {
    if (titleDebounce.current) {
      clearTimeout(titleDebounce.current);
      titleDebounce.current = null;
      const trimmed = title.trim();
      if (trimmed && trimmed !== card.title) void runUpdate({ title: trimmed });
    }
    if (descDebounce.current) {
      clearTimeout(descDebounce.current);
      descDebounce.current = null;
      if (description !== (card.description ?? '')) void runUpdate({ description: description || null });
    }
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
    void runUpdate({ hideCompletedChecklist: next });
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
          {card.coverColor && (
            <div className="boardModalCover" style={{ background: card.coverColor }} />
          )}

          <header className="boardModalHeader">
            <span className="boardModalSeq" title={`Kart numarası`}>BOARD-{card.seq}</span>
            <input
              className="boardModalTitle"
              value={title}
              onChange={(e) => scheduleTitle(e.target.value)}
              disabled={readOnly}
              maxLength={200}
            />
            <span
              className={`boardSaveIndicator boardSaveIndicator-${saveStatus}`}
              aria-live="polite"
            >
              {saveStatus === 'saving' && <><span className="boardSaveDot" /> Kaydediliyor</>}
              {saveStatus === 'saved' && <>✓ Kaydedildi</>}
            </span>
            {!readOnly && onDuplicateCard && (
              <button
                type="button"
                className="boardModalIconBtn"
                onClick={() => void onDuplicateCard()}
                title="Kartı kopyala"
                aria-label="Kartı kopyala"
              >📋</button>
            )}
            {!readOnly && onArchiveCard && (
              <button
                type="button"
                className="boardModalIconBtn"
                onClick={() => { void onArchiveCard(); }}
                title="Arşivle"
                aria-label="Arşivle"
              >📦</button>
            )}
            <button type="button" className="boardModalClose" onClick={() => { flushPending(); onClose(); }} aria-label="Kapat">×</button>
          </header>

          <div className="boardModalContent">
            <div className="boardModalLeft">
              <section className="boardModalRow">
                <span className="boardModalLabel">Atananlar</span>
                <div className="boardModalAssignees">
                  {card.assignees.length === 0 && (
                    <span className="muted" style={{ fontSize: 13 }}>Henüz atanmış kimse yok</span>
                  )}
                  {card.assignees.map(({ member }) => (
                    <span key={member.id} className="boardAssigneeChip" title={member.name}>
                      <span className="boardAssigneeAvatar">{member.name.charAt(0).toUpperCase()}</span>
                      <span className="boardAssigneeName">{member.name}</span>
                      {!readOnly && (
                        <button
                          type="button"
                          className="boardAssigneeRemove"
                          aria-label="Çıkar"
                          onClick={() => {
                            const next = card.assignees.filter((a) => a.member.id !== member.id).map((a) => a.member.id);
                            void onSetAssignees(next);
                          }}
                        >×</button>
                      )}
                    </span>
                  ))}
                  {!readOnly && (
                    <button
                      type="button"
                      className="boardModalChipBtn"
                      onClick={() => setAssigneePopoverOpen((v) => !v)}
                    >
                      + Ata
                    </button>
                  )}
                </div>
                {assigneePopoverOpen && !readOnly && (
                  <div className="boardLabelPopover">
                    <div className="boardLabelPopoverHead">
                      <p className="boardLabelPopoverTitle">Üyeler</p>
                      <button
                        type="button"
                        className="boardLabelPopoverClose"
                        onClick={() => setAssigneePopoverOpen(false)}
                        aria-label="Kapat"
                      >×</button>
                    </div>
                    <div className="boardLabelPopoverList">
                      {members.length === 0 && <p className="muted" style={{ fontSize: 12 }}>Üye yok</p>}
                      {members.map((m) => {
                        const assigned = card.assignees.some((a) => a.member.id === m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            className="boardAssigneePopoverItem"
                            onClick={() => {
                              const cur = new Set(card.assignees.map((a) => a.member.id));
                              if (cur.has(m.id)) cur.delete(m.id);
                              else cur.add(m.id);
                              void onSetAssignees(Array.from(cur));
                            }}
                          >
                            <span className="boardAssigneeAvatar">{m.name.charAt(0).toUpperCase()}</span>
                            <span style={{ flex: 1 }}>{m.name}</span>
                            {assigned && <span style={{ color: '#00d1b6' }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </section>

              <section className="boardModalRow">
                <span className="boardModalLabel">Kapak Rengi</span>
                <div className="boardCoverPicker">
                  {COVER_COLORS.map((c) => {
                    const active = (card.coverColor ?? '') === c;
                    return (
                      <button
                        key={c || 'none'}
                        type="button"
                        className={`boardCoverSwatch${active ? ' isActive' : ''}${!c ? ' isNone' : ''}`}
                        style={c ? { background: c } : undefined}
                        onClick={() => { if (!readOnly) void runUpdate({ coverColor: c || null }); }}
                        disabled={readOnly}
                        aria-label={c ? `Renk ${c}` : 'Renksiz'}
                        title={c || 'Renksiz'}
                      >
                        {!c && '⌀'}
                      </button>
                    );
                  })}
                </div>
              </section>

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
                        onClick={() => { if (!readOnly && !active) void runUpdate({ priority: p }); }}
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
              <div className="boardModalSideTabs">
                <button
                  type="button"
                  className={`boardModalSideTab${sideTab === 'checklist' ? ' isActive' : ''}`}
                  onClick={() => setSideTab('checklist')}
                >
                  ☑ Check-list
                  {totalItems > 0 && <span className="boardModalSideTabBadge">{doneItems}/{totalItems}</span>}
                </button>
                <button
                  type="button"
                  className={`boardModalSideTab${sideTab === 'comments' ? ' isActive' : ''}`}
                  onClick={() => setSideTab('comments')}
                >
                  💬 Yorumlar
                </button>
                <button
                  type="button"
                  className={`boardModalSideTab${sideTab === 'activity' ? ' isActive' : ''}`}
                  onClick={() => setSideTab('activity')}
                >
                  📜 Aktivite
                </button>
              </div>

              {sideTab === 'comments' && (
                <BoardCommentPanel
                  bundle={bundle}
                  cardId={card.id}
                  members={members}
                  currentUserId={currentUserId}
                  readOnly={readOnly}
                  onError={onError}
                />
              )}
              {sideTab === 'activity' && (
                <BoardActivityFeed bundle={bundle} cardId={card.id} onError={onError} />
              )}
              {sideTab === 'checklist' && (
              <>
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
                {visibleChecklist.map((item, idx) => (
                  <ChecklistRow
                    key={item.id}
                    item={item}
                    index={idx}
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
              </>
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
  index,
  readOnly,
  onToggle,
  onDelete,
  onUpdateText,
}: {
  item: BoardChecklistItem;
  index: number;
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
    <motion.li
      layout
      className={`boardChecklistItem${item.done ? ' isDone' : ''}`}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22, delay: Math.min(index, 8) * 0.03, ease: 'easeOut' }}
    >
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
    </motion.li>
  );
}
