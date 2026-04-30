'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardAuthBundle, BoardComment, BoardMember } from '../lib/boardApi';
import { boardFetch } from '../lib/boardApi';

const QUICK_EMOJIS = ['👍', '❤', '🎉', '😄', '🚀', '👀'];

type Props = {
  bundle: BoardAuthBundle;
  cardId: string;
  members: BoardMember[];
  currentUserId: string;
  readOnly: boolean;
  onError: (msg: string) => void;
};

export function BoardCommentPanel({ bundle, cardId, members, currentUserId, readOnly, onError }: Props) {
  const [comments, setComments] = useState<BoardComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [mentionPopoverOpen, setMentionPopoverOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionAnchor, setMentionAnchor] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    boardFetch<BoardComment[]>(bundle, `/board/cards/${cardId}/comments`)
      .then((res) => { if (!cancelled) setComments(res); })
      .catch((e) => { if (!cancelled) onError(e instanceof Error ? e.message : 'Yorumlar yüklenemedi'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bundle, cardId, onError]);

  function detectMention(value: string, caret: number) {
    // caret'ten geriye git, ' ' veya başlangıçtan önceki son '@' karakteri
    let i = caret - 1;
    while (i >= 0 && value[i] !== ' ' && value[i] !== '\n') {
      if (value[i] === '@') {
        const q = value.slice(i + 1, caret);
        // Sadece harfler/rakamlar — boşluk girince popover kapanır
        if (/^[\wÇĞİÖŞÜçğıöşü.\-]*$/.test(q)) {
          setMentionAnchor(i);
          setMentionQuery(q.toLowerCase());
          setMentionPopoverOpen(true);
          return;
        }
        break;
      }
      i--;
    }
    setMentionPopoverOpen(false);
    setMentionAnchor(null);
  }

  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setBody(v);
    detectMention(v, e.target.selectionStart);
  }

  function insertMention(member: BoardMember) {
    if (mentionAnchor === null) return;
    const tag = member.name.replace(/\s+/g, '_');
    const newBody = body.slice(0, mentionAnchor) + '@' + tag + ' ' + body.slice(mentionAnchor + 1 + mentionQuery.length);
    setBody(newBody);
    setMentionPopoverOpen(false);
    setMentionAnchor(null);
    setMentionQuery('');
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const filteredMembers = useMemo(
    () => members.filter((m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery)).slice(0, 6),
    [members, mentionQuery],
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const created = await boardFetch<BoardComment>(bundle, `/board/cards/${cardId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body: text }),
      });
      setComments((prev) => [...prev, created]);
      setBody('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Yorum eklenemedi');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(commentId: string) {
    if (!confirm('Bu yorumu silmek istediğinizden emin misiniz?')) return;
    try {
      await boardFetch(bundle, `/board/comments/${commentId}`, { method: 'DELETE' });
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Yorum silinemedi');
    }
  }

  async function handleEditSave(commentId: string) {
    const text = editBody.trim();
    if (!text) return;
    try {
      const updated = await boardFetch<BoardComment>(bundle, `/board/comments/${commentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ body: text }),
      });
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Yorum güncellenemedi');
    }
  }

  async function handleReact(commentId: string, emoji: string) {
    try {
      const updated = await boardFetch<BoardComment>(bundle, `/board/comments/${commentId}/reactions`, {
        method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Reaksiyon kaydedilemedi');
    }
  }

  function renderBody(text: string) {
    // @mention'ları stilli render et
    const parts = text.split(/(@[\wÇĞİÖŞÜçğıöşü._-]+)/g);
    return parts.map((p, i) =>
      p.startsWith('@') ? (
        <span key={i} className="boardCommentMention">{p}</span>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }

  function groupReactions(c: BoardComment): { emoji: string; count: number; mine: boolean; names: string[] }[] {
    const map = new Map<string, { count: number; mine: boolean; names: string[] }>();
    for (const r of c.reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false, names: [] };
      cur.count += 1;
      if (r.member.id === currentUserId) cur.mine = true;
      cur.names.push(r.member.name);
      map.set(r.emoji, cur);
    }
    return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
  }

  return (
    <div className="boardCommentPanel">
      {loading && <p className="muted boardCommentLoading">Yükleniyor...</p>}
      {!loading && comments.length === 0 && (
        <p className="muted boardCommentEmpty">Henüz yorum yok. İlk yorumu sen yaz.</p>
      )}
      <ul className="boardCommentList">
        <AnimatePresence>
          {comments.map((c) => {
            const reactions = groupReactions(c);
            const editing = editingId === c.id;
            const canEdit = c.author.id === currentUserId;
            return (
              <motion.li
                key={c.id}
                layout
                className="boardCommentItem"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ duration: 0.22 }}
              >
                <span className="boardCommentAvatar">{c.author.name.charAt(0).toUpperCase()}</span>
                <div className="boardCommentContent">
                  <div className="boardCommentHead">
                    <strong className="boardCommentAuthor">{c.author.name}</strong>
                    <span className="boardCommentTime">{new Date(c.createdAt).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    {c.createdAt !== c.updatedAt && <span className="boardCommentEdited">(düzenlendi)</span>}
                  </div>
                  {editing ? (
                    <div className="boardCommentEditWrap">
                      <textarea
                        className="boardCommentEditInput"
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        rows={3}
                        maxLength={4000}
                      />
                      <div className="boardCommentEditActions">
                        <button type="button" onClick={() => handleEditSave(c.id)}>Kaydet</button>
                        <button type="button" onClick={() => { setEditingId(null); setEditBody(''); }}>İptal</button>
                      </div>
                    </div>
                  ) : (
                    <p className="boardCommentBody">{renderBody(c.body)}</p>
                  )}
                  <div className="boardCommentReactions">
                    {reactions.map((r) => (
                      <button
                        key={r.emoji}
                        type="button"
                        className={`boardReactionChip${r.mine ? ' isMine' : ''}`}
                        onClick={() => handleReact(c.id, r.emoji)}
                        title={r.names.join(', ')}
                      >
                        <span>{r.emoji}</span>
                        <span className="boardReactionCount">{r.count}</span>
                      </button>
                    ))}
                    {!readOnly && !editing && (
                      <div className="boardReactionAdd">
                        <button type="button" className="boardReactionAddBtn" aria-label="Reaksiyon ekle">😊+</button>
                        <div className="boardReactionPicker">
                          {QUICK_EMOJIS.map((e) => (
                            <button key={e} type="button" onClick={() => handleReact(c.id, e)}>{e}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {canEdit && !editing && !readOnly && (
                  <div className="boardCommentActions">
                    <button type="button" onClick={() => { setEditingId(c.id); setEditBody(c.body); }} aria-label="Düzenle">✎</button>
                    <button type="button" onClick={() => handleDelete(c.id)} aria-label="Sil" className="isDanger">×</button>
                  </div>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>

      {!readOnly && (
        <form className="boardCommentForm" onSubmit={handleSubmit}>
          <textarea
            ref={textareaRef}
            placeholder="Bir yorum yaz... (@isim ile bahset)"
            value={body}
            onChange={handleBodyChange}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSubmit(e);
              }
            }}
            rows={3}
            maxLength={4000}
          />
          {mentionPopoverOpen && filteredMembers.length > 0 && (
            <div className="boardCommentMentionPopover">
              {filteredMembers.map((m) => (
                <button key={m.id} type="button" onClick={() => insertMention(m)}>
                  <span className="boardCommentMentionAvatar">{m.name.charAt(0).toUpperCase()}</span>
                  <span>{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="boardCommentFormActions">
            <span className="muted boardCommentHint">Ctrl+Enter ile gönder</span>
            <button type="submit" disabled={!body.trim() || submitting}>
              {submitting ? 'Gönderiliyor...' : 'Yorum Yap'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
