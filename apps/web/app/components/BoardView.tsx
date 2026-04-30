'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BoardApiError,
  BoardAuthBundle,
  BoardCard,
  BoardCardPriority,
  BoardCardStatus,
  BoardLabel,
  BoardMember,
  boardFetch,
} from '../lib/boardApi';
import { BoardArchivePanel } from './BoardArchivePanel';
import { BoardCardModal } from './BoardCardModal';
import { BoardKeyboardHelp } from './BoardKeyboardHelp';
import { BoardSkeleton } from './BoardSkeleton';

const COLUMNS: { status: BoardCardStatus; label: string; accent: string }[] = [
  { status: 'TODO', label: 'To Do', accent: '#23a4ff' },
  { status: 'IN_PROGRESS', label: 'In Progress', accent: '#f0b429' },
  { status: 'DONE', label: 'Done', accent: '#00d1b6' },
];

export const PRIORITY_META: Record<BoardCardPriority, { label: string; color: string; bg: string }> = {
  LOW: { label: 'Düşük', color: '#0a8a3a', bg: 'linear-gradient(135deg,#7be495,#2ecc71)' },
  MEDIUM: { label: 'Orta', color: '#8a5e00', bg: 'linear-gradient(135deg,#ffd86b,#f0b429)' },
  HIGH: { label: 'Yüksek', color: '#7a0e1f', bg: 'linear-gradient(135deg,#ff8e8e,#e74c3c)' },
};

type DateStatus = 'overdue' | 'soon' | 'normal' | null;
type DateFilter = 'all' | 'overdue' | 'today' | 'week' | 'none';

function getDateStatus(dueAt: string | null): DateStatus {
  if (!dueAt) return null;
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return null;
  const now = Date.now();
  const diff = due - now;
  const oneDay = 24 * 60 * 60 * 1000;
  if (diff < 0) return 'overdue';
  if (diff <= 3 * oneDay) return 'soon';
  return 'normal';
}

function daysFromNow(dueAt: string): number {
  const due = new Date(dueAt).getTime();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.ceil((due - today.getTime()) / (24 * 60 * 60 * 1000));
}

type Props = {
  bundle: BoardAuthBundle;
  readOnly: boolean;
  onAuthError: () => void;
};

type Toast = { kind: 'success' | 'error' | 'info'; msg: string } | null;

type FilterState = {
  text: string;
  priorities: Set<BoardCardPriority>;
  labelIds: Set<string>;
  date: DateFilter;
};

const EMPTY_FILTER: FilterState = {
  text: '',
  priorities: new Set(),
  labelIds: new Set(),
  date: 'all',
};

export function BoardView({ bundle, readOnly, onAuthError }: Props) {
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [labels, setLabels] = useState<BoardLabel[]>([]);
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [archivePanelOpen, setArchivePanelOpen] = useState(false);
  const [confetti, setConfetti] = useState<{ x: number; y: number; key: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<BoardCardStatus | null>(null);
  const [newCardTitle, setNewCardTitle] = useState('');
  const [newCardPriority, setNewCardPriority] = useState<BoardCardPriority>('MEDIUM');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<BoardCardStatus | null>(null);
  const [dropTarget, setDropTarget] = useState<{ cardId: string; pos: 'before' | 'after' } | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [recentlyCreatedId, setRecentlyCreatedId] = useState<string | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [quickMenuId, setQuickMenuId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((kind: NonNullable<Toast>['kind'], msg: string) => {
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
        const [cardsRes, labelsRes, membersRes] = await Promise.all([
          boardFetch<BoardCard[]>(bundle, '/board/cards'),
          boardFetch<BoardLabel[]>(bundle, '/board/labels'),
          boardFetch<BoardMember[]>(bundle, '/board/members'),
        ]);
        if (cancelled) return;
        setCards(cardsRes);
        setLabels(labelsRes);
        setMembers(membersRes);
      } catch (err) {
        handleApiError(err, 'Veriler yuklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [bundle, handleApiError]);

  // ?card=<id> permalink → modal aç
  useEffect(() => {
    if (loading) return;
    const params = new URLSearchParams(window.location.search);
    const cardParam = params.get('card');
    if (cardParam && cards.some((c) => c.id === cardParam)) {
      setOpenCardId(cardParam);
    }
  }, [loading, cards]);

  // global klavye kısayolları
  useEffect(() => {
    function isEditable(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === '?' && !isEditable(e.target)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (quickMenuId) { setQuickMenuId(null); return; }
        if (addingTo) { setAddingTo(null); setNewCardTitle(''); return; }
        // filter dolu ise temizle
        if (filter.text || filter.priorities.size || filter.labelIds.size || filter.date !== 'all') {
          setFilter(EMPTY_FILTER);
        }
        return;
      }
      if (isEditable(e.target)) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if ((e.key === 'n' || e.key === 'N') && !readOnly) {
        e.preventDefault();
        setAddingTo('TODO');
        setNewCardTitle('');
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && bulkMode && selectedIds.size > 0) {
        e.preventDefault();
        void handleBulkDelete();
        return;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [helpOpen, quickMenuId, addingTo, filter, bulkMode, selectedIds, readOnly]);

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} karti silmek istediginizden emin misiniz?`)) return;
    const ids = Array.from(selectedIds);
    try {
      await boardFetch(bundle, '/board/cards/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      });
      setCards((prev) => prev.filter((c) => !selectedIds.has(c.id)));
      showToast('success', `${ids.length} kart silindi`);
      exitBulkMode();
    } catch (err) {
      handleApiError(err, 'Kartlar silinemedi');
    }
  }

  async function handleCreateCard(e: FormEvent, status: BoardCardStatus) {
    e.preventDefault();
    const title = newCardTitle.trim();
    if (!title) return;
    const priority = newCardPriority;
    setNewCardTitle('');
    setNewCardPriority('MEDIUM');
    setAddingTo(null);
    try {
      const card = await boardFetch<BoardCard>(bundle, '/board/cards', {
        method: 'POST',
        body: JSON.stringify({ title, status, priority }),
      });
      setCards((prev) => [...prev, card]);
      setRecentlyCreatedId(card.id);
      setTimeout(() => setRecentlyCreatedId(null), 600);
    } catch (err) {
      handleApiError(err, 'Kart olusturulamadi');
    }
  }

  async function handleMoveAndReorder(
    cardId: string,
    targetStatus: BoardCardStatus,
    targetCardId: string | null,
    targetPos: 'before' | 'after',
    dropPoint?: { x: number; y: number },
  ) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    // confetti tetikle: TODO/IN_PROGRESS → DONE geçişi
    if (targetStatus === 'DONE' && card.status !== 'DONE' && dropPoint) {
      setConfetti({ x: dropPoint.x, y: dropPoint.y, key: Date.now() });
      setTimeout(() => setConfetti(null), 1500);
    }
    const others = cards
      .filter((c) => c.status === targetStatus && c.id !== cardId)
      .sort((a, b) => a.position - b.position);
    let insertIdx: number;
    if (!targetCardId) {
      insertIdx = others.length;
    } else {
      const tIdx = others.findIndex((c) => c.id === targetCardId);
      insertIdx = tIdx < 0 ? others.length : targetPos === 'before' ? tIdx : tIdx + 1;
    }
    const newOrder = [...others.slice(0, insertIdx), { ...card, status: targetStatus }, ...others.slice(insertIdx)];
    const updates = newOrder.map((c, i) => ({ id: c.id, status: targetStatus, position: i }));
    const original = cards;
    // optimistic
    setCards((prev) =>
      prev.map((c) => {
        const u = updates.find((u) => u.id === c.id);
        return u ? { ...c, status: u.status, position: u.position } : c;
      }),
    );
    try {
      const changed = updates.filter((u) => {
        const orig = original.find((c) => c.id === u.id);
        return !orig || orig.status !== u.status || orig.position !== u.position;
      });
      await Promise.all(
        changed.map((u) =>
          boardFetch(bundle, `/board/cards/${u.id}/move`, {
            method: 'PATCH',
            body: JSON.stringify({ status: u.status, position: u.position }),
          }),
        ),
      );
    } catch (err) {
      handleApiError(err, 'Sıralama kaydedilemedi');
      setCards(original);
    }
  }

  async function reorderWithinColumn(cardId: string, direction: 'up' | 'down') {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const sameCol = cards
      .filter((c) => c.status === card.status)
      .sort((a, b) => a.position - b.position);
    const idx = sameCol.findIndex((c) => c.id === cardId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sameCol.length) return;
    const target = sameCol[swapIdx];
    await handleMoveAndReorder(cardId, card.status, target.id, direction === 'up' ? 'before' : 'after');
  }

  async function patchCard(cardId: string, patch: Record<string, unknown>) {
    try {
      const updated = await boardFetch<BoardCard>(bundle, `/board/cards/${cardId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
      return updated;
    } catch (err) {
      handleApiError(err, 'Kart guncellenemedi');
      return null;
    }
  }

  async function archiveCard(cardId: string) {
    try {
      await boardFetch(bundle, `/board/cards/${cardId}/archive`, { method: 'PATCH' });
      setCards((prev) => prev.filter((c) => c.id !== cardId));
      setOpenCardId(null);
      showToast('success', 'Kart arşivlendi');
    } catch (err) {
      handleApiError(err, 'Arşivlenemedi');
    }
  }

  function handleArchiveRestored(restored: BoardCard) {
    setCards((prev) => {
      // varsa güncelle, yoksa ekle
      const exists = prev.some((c) => c.id === restored.id);
      return exists ? prev.map((c) => (c.id === restored.id ? restored : c)) : [...prev, restored];
    });
    showToast('success', 'Kart geri yüklendi');
  }

  async function setAssignees(cardId: string, memberIds: string[]) {
    try {
      const updated = await boardFetch<BoardCard>(bundle, `/board/cards/${cardId}/assignees`, {
        method: 'PUT',
        body: JSON.stringify({ memberIds }),
      });
      setCards((prev) => prev.map((c) => (c.id === cardId ? updated : c)));
    } catch (err) {
      handleApiError(err, 'Atama güncellenemedi');
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

  async function duplicateCard(cardId: string) {
    try {
      const card = await boardFetch<BoardCard>(bundle, `/board/cards/${cardId}/duplicate`, { method: 'POST' });
      setCards((prev) => [...prev, card]);
      setRecentlyCreatedId(card.id);
      setTimeout(() => setRecentlyCreatedId(null), 600);
      showToast('success', 'Kart kopyalandı');
    } catch (err) {
      handleApiError(err, 'Kart kopyalanamadı');
    }
  }

  function copyPermalink(cardId: string) {
    try {
      const url = `${window.location.origin}/board?card=${cardId}`;
      navigator.clipboard?.writeText(url);
      showToast('success', 'Link kopyalandı');
    } catch {
      showToast('error', 'Link kopyalanamadı');
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
    if (readOnly || bulkMode) return;
    e.dataTransfer.setData('boardCardId', cardId);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(cardId);
  }

  function handleCardDragOver(e: DragEvent, cardId: string, status: BoardCardStatus) {
    if (readOnly || bulkMode) return;
    if (!draggingId || draggingId === cardId) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const midpoint = rect.top + rect.height / 2;
    const pos: 'before' | 'after' = e.clientY < midpoint ? 'before' : 'after';
    setOverColumn(status);
    setDropTarget((cur) => (cur?.cardId === cardId && cur.pos === pos ? cur : { cardId, pos }));
  }

  function handleColumnDrop(e: DragEvent, status: BoardCardStatus) {
    e.preventDefault();
    if (readOnly || bulkMode) {
      setDraggingId(null);
      setDropTarget(null);
      setOverColumn(null);
      return;
    }
    const cardId = e.dataTransfer.getData('boardCardId');
    const tgt = dropTarget;
    const dropPoint = { x: e.clientX, y: e.clientY };
    setOverColumn(null);
    setDropTarget(null);
    setDraggingId(null);
    if (!cardId) return;
    void handleMoveAndReorder(cardId, status, tgt?.cardId ?? null, tgt?.pos ?? 'after', dropPoint);
  }

  // ----- filtered cards -----
  const filteredCards = useMemo(() => {
    const text = filter.text.trim().toLowerCase();
    return cards.filter((c) => {
      if (text) {
        const hay = `${c.title} ${c.description ?? ''}`.toLowerCase();
        if (!hay.includes(text)) return false;
      }
      if (filter.priorities.size > 0 && !filter.priorities.has(c.priority ?? 'MEDIUM')) return false;
      if (filter.labelIds.size > 0) {
        const cardLabelIds = new Set(c.labels.map((l) => l.label.id));
        if (![...filter.labelIds].some((id) => cardLabelIds.has(id))) return false;
      }
      if (filter.date !== 'all') {
        const due = c.dueAt ? new Date(c.dueAt) : null;
        if (filter.date === 'none') {
          if (due) return false;
        } else if (!due) {
          return false;
        } else {
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
          if (filter.date === 'overdue' && due >= tomorrow) return false;
          if (filter.date === 'today' && (due < today || due >= tomorrow)) return false;
          if (filter.date === 'week') {
            const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7);
            if (due < today || due >= weekEnd) return false;
          }
        }
      }
      return true;
    });
  }, [cards, filter]);

  const filterActive =
    !!filter.text || filter.priorities.size > 0 || filter.labelIds.size > 0 || filter.date !== 'all';

  function togglePriorityFilter(p: BoardCardPriority) {
    setFilter((prev) => {
      const next = new Set(prev.priorities);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...prev, priorities: next };
    });
  }
  function toggleLabelFilter(id: string) {
    setFilter((prev) => {
      const next = new Set(prev.labelIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, labelIds: next };
    });
  }
  function setDateFilter(d: DateFilter) {
    setFilter((prev) => ({ ...prev, date: d }));
  }

  const openCard = openCardId ? cards.find((c) => c.id === openCardId) ?? null : null;

  if (loading) return <BoardSkeleton />;

  return (
    <div className="boardShell" data-bulk={bulkMode ? 'true' : 'false'}>
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.msg}
            className={`boardToast boardToast-${toast.kind}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---- Filtre bar ---- */}
      <div className="boardFilterBar">
        <div className="boardFilterSearch">
          <span className="boardFilterIcon">⌕</span>
          <input
            ref={searchRef}
            type="text"
            placeholder="Kart ara... (/)"
            value={filter.text}
            onChange={(e) => setFilter((p) => ({ ...p, text: e.target.value }))}
          />
          {filter.text && (
            <button
              type="button"
              className="boardFilterClearBtn"
              onClick={() => setFilter((p) => ({ ...p, text: '' }))}
              aria-label="Aramayı temizle"
            >×</button>
          )}
        </div>

        <div className="boardFilterChips">
          {(['LOW', 'MEDIUM', 'HIGH'] as BoardCardPriority[]).map((p) => {
            const m = PRIORITY_META[p];
            const active = filter.priorities.has(p);
            return (
              <button
                key={p}
                type="button"
                className={`boardFilterChip${active ? ' isActive' : ''}`}
                style={active ? { background: m.bg, color: m.color, borderColor: 'transparent' } : undefined}
                onClick={() => togglePriorityFilter(p)}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="boardFilterChips">
          {(['all', 'overdue', 'today', 'week', 'none'] as DateFilter[]).map((d) => {
            const labelMap: Record<DateFilter, string> = {
              all: 'Tüm tarihler', overdue: 'Gecikmiş', today: 'Bugün', week: 'Bu hafta', none: 'Tarihsiz',
            };
            return (
              <button
                key={d}
                type="button"
                className={`boardFilterChip${filter.date === d ? ' isActive' : ''}`}
                onClick={() => setDateFilter(d)}
              >
                {labelMap[d]}
              </button>
            );
          })}
        </div>

        {labels.length > 0 && (
          <div className="boardFilterLabelWrap">
            <button
              type="button"
              className={`boardFilterChip${filter.labelIds.size > 0 ? ' isActive' : ''}`}
              onClick={() => setLabelPickerOpen((v) => !v)}
            >
              Etiket {filter.labelIds.size > 0 ? `(${filter.labelIds.size})` : ''}
            </button>
            {labelPickerOpen && (
              <div className="boardFilterLabelPopover">
                {labels.map((l) => {
                  const active = filter.labelIds.has(l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className="boardFilterLabelOption"
                      onClick={() => toggleLabelFilter(l.id)}
                    >
                      <span className="boardFilterLabelDot" style={{ background: l.color }} />
                      <span>{l.name}</span>
                      {active && <span className="boardFilterLabelCheck">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {filterActive && (
          <button
            type="button"
            className="boardFilterClearAll"
            onClick={() => setFilter(EMPTY_FILTER)}
          >
            Temizle
          </button>
        )}

        <button
          type="button"
          className="boardFilterHelpBtn"
          onClick={() => setHelpOpen(true)}
          aria-label="Klavye kısayolları"
          title="Klavye kısayolları (?)"
        >?</button>
      </div>

      {/* ---- Action bar (bulk) ---- */}
      {!readOnly && (
        <div className="boardActionBar">
          {!bulkMode ? (
            <>
              <button type="button" className="boardActionBtn" onClick={() => setBulkMode(true)}>
                ✓ Toplu Seç
              </button>
              <button type="button" className="boardActionBtn" onClick={() => setArchivePanelOpen(true)}>
                📦 Arşiv
              </button>
            </>
          ) : (
            <>
              <span className="boardSelectionInfo">
                <strong>{selectedIds.size}</strong> kart seçili
              </span>
              <button
                type="button"
                className="boardActionBtn boardActionBtn-danger"
                disabled={selectedIds.size === 0}
                onClick={handleBulkDelete}
              >
                Seçilenleri Sil
              </button>
              <button type="button" className="boardActionBtn" onClick={exitBulkMode}>
                Vazgeç
              </button>
            </>
          )}
        </div>
      )}

      {/* ---- Kolonlar ---- */}
      <div className="boardColumns">
        {COLUMNS.map((col, colIndex) => {
          const colCards = filteredCards
            .filter((c) => c.status === col.status)
            .sort((a, b) => a.position - b.position);
          const totalInColumn = cards.filter((c) => c.status === col.status).length;
          const isOver = overColumn === col.status;
          return (
            <motion.section
              key={col.status}
              className="boardColumn"
              data-over={isOver ? 'true' : 'false'}
              data-status={col.status}
              style={{ borderTop: `3px solid ${col.accent}` }}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: colIndex * 0.08, ease: 'easeOut' }}
              onDragOver={(e) => {
                if (!readOnly && !bulkMode) {
                  e.preventDefault();
                  setOverColumn(col.status);
                }
              }}
              onDragLeave={(e) => {
                const next = e.relatedTarget as Node | null;
                if (!next || !(e.currentTarget as Node).contains(next)) {
                  setOverColumn(null);
                  setDropTarget(null);
                }
              }}
              onDrop={(e) => handleColumnDrop(e, col.status)}
            >
              <header className="boardColumnHeader">
                <span style={{ color: col.accent }}>{col.label}</span>
                <span className="boardColumnCount" key={totalInColumn} data-tick="true">{totalInColumn}</span>
              </header>

              <div className="boardCardList">
                {colCards.length === 0 && totalInColumn === 0 && !readOnly && (
                  <div className="boardEmptyHint">İlk kartı buraya ekle</div>
                )}
                {colCards.length === 0 && totalInColumn > 0 && (
                  <div className="boardEmptyHint">Filtreyle eşleşen kart yok</div>
                )}
                <AnimatePresence>
                  {colCards.map((card, cardIdx) => {
                    const priority = card.priority ?? 'MEDIUM';
                    const meta = PRIORITY_META[priority];
                    const selected = selectedIds.has(card.id);
                    const dueStatus = getDateStatus(card.dueAt);
                    const isHighOverdue = priority === 'HIGH' && dueStatus === 'overdue';
                    const checklistDone = card.checklist.filter((i) => i.done).length;
                    const checklistTotal = card.checklist.length;
                    const checklistPct = checklistTotal > 0 ? (checklistDone / checklistTotal) * 100 : 0;
                    const showInsertBefore = dropTarget?.cardId === card.id && dropTarget.pos === 'before' && draggingId !== card.id;
                    const showInsertAfter = dropTarget?.cardId === card.id && dropTarget.pos === 'after' && draggingId !== card.id;
                    return (
                      <div key={card.id} className="boardCardSlot">
                        {showInsertBefore && <div className="boardDropIndicator" />}
                        <motion.article
                          layoutId={`boardCard-${card.id}`}
                          layout
                          className={`boardCard${recentlyCreatedId === card.id ? ' isNew' : ''}${selected ? ' isSelected' : ''}${draggingId === card.id ? ' isDragging' : ''}${isHighOverdue ? ' isHighOverdue' : ''}${card.coverColor ? ' hasCover' : ''}`}
                          data-priority={priority}
                          initial={{ opacity: 0, scale: 0.9, y: -8 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.85, x: 30 }}
                          transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                          whileHover={readOnly ? undefined : { y: -3 }}
                          draggable={!readOnly && !bulkMode}
                          onDragStart={(e) => handleDragStart(e as unknown as DragEvent, card.id)}
                          onDragOver={(e) => handleCardDragOver(e as unknown as DragEvent, card.id, col.status)}
                          onDragEnd={() => { setDraggingId(null); setOverColumn(null); setDropTarget(null); }}
                          onClick={() => {
                            if (bulkMode) toggleSelect(card.id);
                            else setOpenCardId(card.id);
                          }}
                        >
                          <div className="boardCardTopRow">
                            {bulkMode && (
                              <span className={`boardCardSelectBox${selected ? ' isChecked' : ''}`} aria-label="Sec">
                                {selected ? '✓' : ''}
                              </span>
                            )}
                            <span
                              className="boardPriorityBadge"
                              style={{ background: meta.bg, color: meta.color }}
                              title={`Öncelik: ${meta.label}`}
                            >
                              {meta.label}
                            </span>
                            {!readOnly && !bulkMode && (
                              <button
                                type="button"
                                className="boardCardQuickBtn"
                                aria-label="Hızlı eylemler"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setQuickMenuId((cur) => (cur === card.id ? null : card.id));
                                }}
                              >⋯</button>
                            )}
                            {quickMenuId === card.id && (
                              <div
                                className="boardCardQuickMenu"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button type="button" onClick={() => { void duplicateCard(card.id); setQuickMenuId(null); }}>
                                  📋 Kopyala
                                </button>
                                <button type="button" onClick={() => { copyPermalink(card.id); setQuickMenuId(null); }}>
                                  🔗 Linki kopyala
                                </button>
                                <button
                                  type="button"
                                  className="isDanger"
                                  onClick={() => {
                                    if (confirm('Bu karti silmek istediginizden emin misiniz?')) void deleteCard(card.id);
                                    setQuickMenuId(null);
                                  }}
                                >
                                  🗑 Sil
                                </button>
                              </div>
                            )}
                          </div>
                          {card.coverColor && (
                            <div className="boardCardCover" style={{ background: card.coverColor }} />
                          )}
                          {card.labels.length > 0 && (
                            <div className="boardCardLabels">
                              {card.labels.map(({ label }) => (
                                <span
                                  key={label.id}
                                  className="boardLabelChipFull"
                                  title={label.name}
                                  style={{ background: label.color }}
                                >
                                  {label.name}
                                </span>
                              ))}
                            </div>
                          )}
                          <h3 className="boardCardTitle">
                            <span className="boardCardSeq">#{card.seq}</span> {card.title}
                          </h3>
                          {checklistTotal > 0 && (
                            <div className="boardCardProgress" title={`${checklistDone}/${checklistTotal}`}>
                              <div className="boardCardProgressBar" style={{ width: `${checklistPct}%` }} />
                            </div>
                          )}
                          <div className="boardCardMeta">
                            {card.dueAt && (
                              <span
                                className={`boardCardMetaItem boardDueBadge${dueStatus ? ` boardDueBadge-${dueStatus}` : ''}`}
                                title={dueStatus === 'overdue'
                                  ? `${Math.abs(daysFromNow(card.dueAt))} gün gecikmiş`
                                  : dueStatus === 'soon'
                                  ? `${daysFromNow(card.dueAt)} gün içinde`
                                  : 'Bitiş'}
                              >
                                📅 {new Date(card.dueAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })}
                                {dueStatus === 'overdue' && <span className="boardDueLabel"> · Gecikmiş</span>}
                                {dueStatus === 'soon' && <span className="boardDueLabel"> · Yakında</span>}
                              </span>
                            )}
                            {checklistTotal > 0 && (
                              <span className="boardCardMetaItem" title="Check-list">
                                ☑ {checklistDone}/{checklistTotal}
                              </span>
                            )}
                            {card.description && (
                              <span className="boardCardMetaItem" title="Açıklama var">📝</span>
                            )}
                            {card.assignees.length > 0 && (
                              <span className="boardAssigneeStack">
                                {card.assignees.slice(0, 3).map(({ member }) => (
                                  <span
                                    key={member.id}
                                    className="boardAssigneeAvatar boardAssigneeAvatar-stacked"
                                    title={member.name}
                                  >
                                    {member.name.charAt(0).toUpperCase()}
                                  </span>
                                ))}
                                {card.assignees.length > 3 && (
                                  <span className="boardAssigneeMore">+{card.assignees.length - 3}</span>
                                )}
                              </span>
                            )}
                          </div>
                          {!readOnly && !bulkMode && (
                            <div className="boardCardReorder">
                              <button
                                type="button"
                                className="boardCardReorderBtn"
                                disabled={cardIdx === 0}
                                onClick={(e) => { e.stopPropagation(); void reorderWithinColumn(card.id, 'up'); }}
                                aria-label="Yukari tasi"
                                title="Yukari tasi"
                              >▲</button>
                              <button
                                type="button"
                                className="boardCardReorderBtn"
                                disabled={cardIdx === colCards.length - 1}
                                onClick={(e) => { e.stopPropagation(); void reorderWithinColumn(card.id, 'down'); }}
                                aria-label="Asagi tasi"
                                title="Asagi tasi"
                              >▼</button>
                            </div>
                          )}
                        </motion.article>
                        {showInsertAfter && <div className="boardDropIndicator" />}
                      </div>
                    );
                  })}
                </AnimatePresence>

                {!readOnly && !bulkMode && addingTo === col.status && (
                  <form className="boardAddCardForm" onSubmit={(e) => handleCreateCard(e, col.status)}>
                    <input
                      autoFocus
                      placeholder="Kart basligi..."
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Escape') { setAddingTo(null); setNewCardTitle(''); setNewCardPriority('MEDIUM'); } }}
                      maxLength={200}
                    />
                    <div className="boardAddCardPriority">
                      {(['LOW', 'MEDIUM', 'HIGH'] as BoardCardPriority[]).map((p) => {
                        const m = PRIORITY_META[p];
                        const active = newCardPriority === p;
                        return (
                          <button
                            key={p}
                            type="button"
                            className={`boardPriorityChoice${active ? ' isActive' : ''}`}
                            style={active ? { background: m.bg, color: m.color, borderColor: 'transparent' } : undefined}
                            onClick={() => setNewCardPriority(p)}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="boardAddCardActions">
                      <button type="submit">Ekle</button>
                      <button type="button" onClick={() => { setAddingTo(null); setNewCardTitle(''); setNewCardPriority('MEDIUM'); }}>İptal</button>
                    </div>
                  </form>
                )}

                {!readOnly && !bulkMode && addingTo !== col.status && (
                  <button
                    type="button"
                    className="boardAddCardBtn"
                    onClick={() => { setAddingTo(col.status); setNewCardTitle(''); setNewCardPriority('MEDIUM'); }}
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

      <AnimatePresence>
        {openCard && (
          <BoardCardModal
            key={openCard.id}
            card={openCard}
            labels={labels}
            members={members}
            bundle={bundle}
            currentUserId={bundle.user.id}
            readOnly={readOnly}
            onClose={() => {
              setOpenCardId(null);
              const params = new URLSearchParams(window.location.search);
              if (params.has('card')) {
                params.delete('card');
                const next = params.toString();
                window.history.replaceState({}, '', next ? `?${next}` : window.location.pathname);
              }
            }}
            onUpdateCard={(patch) => patchCard(openCard.id, patch).then(() => undefined)}
            onDeleteCard={() => deleteCard(openCard.id)}
            onArchiveCard={() => archiveCard(openCard.id)}
            onDuplicateCard={() => duplicateCard(openCard.id)}
            onSetLabels={(ids) => setCardLabels(openCard.id, ids)}
            onSetAssignees={(ids) => setAssignees(openCard.id, ids)}
            onCreateLabel={createLabel}
            onDeleteLabel={deleteLabel}
            onAddChecklistItem={(text) => addChecklistItem(openCard.id, text)}
            onUpdateChecklistItem={(itemId, patch) => updateChecklistItem(openCard.id, itemId, patch)}
            onDeleteChecklistItem={(itemId) => deleteChecklistItem(openCard.id, itemId)}
            onError={(msg) => showToast('error', msg)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {helpOpen && <BoardKeyboardHelp onClose={() => setHelpOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {archivePanelOpen && (
          <BoardArchivePanel
            bundle={bundle}
            readOnly={readOnly}
            onClose={() => setArchivePanelOpen(false)}
            onRestore={handleArchiveRestored}
            onError={(msg) => showToast('error', msg)}
          />
        )}
      </AnimatePresence>

      {confetti && <ConfettiBurst x={confetti.x} y={confetti.y} burstKey={confetti.key} />}
    </div>
  );
}

// ---- Confetti (inline canvas/particles) ----
function ConfettiBurst({ x, y, burstKey }: { x: number; y: number; burstKey: number }) {
  const particles = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => {
      const angle = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 80 + Math.random() * 80;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - 30;
      const colors = ['#23a4ff', '#00d1b6', '#f0b429', '#e74c3c', '#9b59b6', '#2ecc71'];
      return {
        id: i,
        dx,
        dy,
        color: colors[i % colors.length],
        size: 6 + Math.random() * 6,
        rot: Math.random() * 360,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burstKey]);

  return (
    <div className="boardConfettiRoot" style={{ left: x, top: y }} aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.id}
          className="boardConfettiPiece"
          style={{
            background: p.color,
            width: p.size,
            height: p.size,
            ['--cx' as string]: `${p.dx}px`,
            ['--cy' as string]: `${p.dy}px`,
            ['--cr' as string]: `${p.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
