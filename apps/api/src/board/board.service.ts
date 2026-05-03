import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardCardPriority, BoardCardStatus, Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { BulkDeleteCardsDto } from './dto/bulk-delete-cards.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { ReactCommentDto } from './dto/react-comment.dto';
import { SetCardAssigneesDto } from './dto/set-card-assignees.dto';
import { SetCardLabelsDto } from './dto/set-card-labels.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const cardSelect = {
  id: true,
  seq: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  startAt: true,
  dueAt: true,
  position: true,
  hideCompletedChecklist: true,
  archivedAt: true,
  coverColor: true,
  coverImageUrl: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  labels: {
    select: {
      label: { select: { id: true, name: true, color: true } },
    },
  },
  checklist: {
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] as Prisma.BoardChecklistItemOrderByWithRelationInput[],
    select: {
      id: true,
      text: true,
      done: true,
      position: true,
      createdAt: true,
    },
  },
  assignees: {
    select: {
      member: { select: { id: true, name: true, email: true, role: true } },
    },
  },
} satisfies Prisma.BoardCardSelect;

const commentSelect = {
  id: true,
  cardId: true,
  body: true,
  mentions: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true, role: true } },
  reactions: {
    select: {
      emoji: true,
      member: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.BoardCommentSelect;

function parseMentions(body: string): string[] {
  // @username veya @"name with spaces" — şu an basit token: word chars
  const matches = body.match(/@([A-Za-zÇĞİÖŞÜçğıöşü][\wÇĞİÖŞÜçğıöşü.\-]{1,40})/g) ?? [];
  return Array.from(new Set(matches.map((m) => m.slice(1))));
}

function assertWriter(role: string) {
  if (role !== 'CAPTAIN' && role !== 'BOARD') {
    throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
  }
}

@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogs: AuditLogsService,
    private readonly events: EventsService,
  ) {}

  async listCards() {
    return this.prisma.boardCard.findMany({
      where: { archivedAt: null },
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: cardSelect,
    });
  }

  async listArchived() {
    return this.prisma.boardCard.findMany({
      where: { archivedAt: { not: null } },
      orderBy: { archivedAt: 'desc' },
      select: cardSelect,
    });
  }

  async getConfig() {
    let cfg = await this.prisma.boardConfig.findUnique({ where: { id: 1 } });
    if (!cfg) {
      cfg = await this.prisma.boardConfig.create({
        data: { id: 1 },
      });
    }
    return cfg;
  }

  async updateConfig(actorId: string, role: string, data: { wipLimitTodo?: number | null; wipLimitInProgress?: number | null; wipLimitDone?: number | null }) {
    assertWriter(role);
    await this.getConfig(); // ensure exists
    const cfg = await this.prisma.boardConfig.update({
      where: { id: 1 },
      data,
    });
    this.events.broadcastAll({ type: 'board:label:changed', actorId }); // reuse label:changed as generic refresh signal
    return cfg;
  }

  async listMembers() {
    return this.prisma.teamMember.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async createCard(actorId: string, role: string, dto: CreateCardDto) {
    assertWriter(role);
    const status = (dto.status ?? 'TODO') as BoardCardStatus;
    let position = dto.position;
    if (position === undefined) {
      const last = await this.prisma.boardCard.findFirst({
        where: { status },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      position = last ? last.position + 1 : 0;
    }
    const card = await this.prisma.boardCard.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        status,
        priority: (dto.priority ?? 'MEDIUM') as BoardCardPriority,
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        position,
        createdById: actorId,
      },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_CREATE', 'BOARD_CARD', card.id, { title: card.title });
    this.events.broadcastAll({ type: 'board:card:upserted', cardId: card.id, actorId });
    return card;
  }

  async updateCard(actorId: string, role: string, cardId: string, dto: UpdateCardDto) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    const data: Prisma.BoardCardUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.priority !== undefined) data.priority = dto.priority as BoardCardPriority;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startAt !== undefined) data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.hideCompletedChecklist !== undefined) data.hideCompletedChecklist = dto.hideCompletedChecklist;
    if (dto.coverColor !== undefined) data.coverColor = dto.coverColor;
    if (dto.coverImageUrl !== undefined) data.coverImageUrl = dto.coverImageUrl;
    const updated = await this.prisma.boardCard.update({ where: { id: cardId }, data, select: cardSelect });
    this.events.broadcastAll({ type: 'board:card:upserted', cardId, actorId });
    return updated;
  }

  async archiveCard(actorId: string, role: string, cardId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, title: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    const updated = await this.prisma.boardCard.update({
      where: { id: cardId },
      data: { archivedAt: new Date() },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_ARCHIVE', 'BOARD_CARD', cardId, { title: exists.title });
    this.events.broadcastAll({ type: 'board:card:archived', cardId, actorId });
    return updated;
  }

  async restoreCard(actorId: string, role: string, cardId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, title: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    const updated = await this.prisma.boardCard.update({
      where: { id: cardId },
      data: { archivedAt: null },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_RESTORE', 'BOARD_CARD', cardId, { title: exists.title });
    this.events.broadcastAll({ type: 'board:card:restored', cardId, actorId });
    return updated;
  }

  async setCardAssignees(actorId: string, role: string, cardId: string, dto: SetCardAssigneesDto) {
    assertWriter(role);
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    if (dto.memberIds.length > 0) {
      const found = await this.prisma.teamMember.findMany({
        where: { id: { in: dto.memberIds } },
        select: { id: true },
      });
      if (found.length !== dto.memberIds.length) {
        throw new NotFoundException('Bir veya daha fazla üye bulunamadı');
      }
    }
    await this.prisma.$transaction([
      this.prisma.boardCardAssignee.deleteMany({ where: { cardId } }),
      ...(dto.memberIds.length
        ? [
            this.prisma.boardCardAssignee.createMany({
              data: dto.memberIds.map((memberId) => ({ cardId, memberId })),
            }),
          ]
        : []),
    ]);
    await this.auditLogs.log(actorId, 'BOARD_CARD_ASSIGN', 'BOARD_CARD', cardId, { memberIds: dto.memberIds });
    this.events.broadcastAll({ type: 'board:card:upserted', cardId, actorId });
    return this.prisma.boardCard.findUnique({ where: { id: cardId }, select: cardSelect });
  }

  // ---- Comments ----
  async listComments(cardId: string) {
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    return this.prisma.boardComment.findMany({
      where: { cardId },
      orderBy: { createdAt: 'asc' },
      select: commentSelect,
    });
  }

  async createComment(actorId: string, cardId: string, dto: CreateCommentDto) {
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    const mentions = parseMentions(dto.body);
    const comment = await this.prisma.boardComment.create({
      data: { cardId, authorId: actorId, body: dto.body, mentions },
      select: commentSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_COMMENT_CREATE', 'BOARD_COMMENT', comment.id, {
      cardId,
      mentions,
    });
    this.events.broadcastAll({
      type: 'board:comment:new',
      cardId,
      commentId: comment.id,
      authorId: actorId,
      authorName: comment.author.name,
    });
    return comment;
  }

  async updateComment(actorId: string, role: string, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.boardComment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true },
    });
    if (!comment) throw new NotFoundException('Yorum bulunamadi');
    if (comment.authorId !== actorId && role !== 'CAPTAIN' && role !== 'BOARD') {
      throw new ForbiddenException('Sadece kendi yorumunuzu düzenleyebilirsiniz');
    }
    const mentions = parseMentions(dto.body);
    const updated = await this.prisma.boardComment.update({
      where: { id: commentId },
      data: { body: dto.body, mentions },
      select: commentSelect,
    });
    this.events.broadcastAll({ type: 'board:comment:updated', cardId: updated.cardId, commentId, actorId });
    return updated;
  }

  async deleteComment(actorId: string, role: string, commentId: string) {
    const comment = await this.prisma.boardComment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, cardId: true },
    });
    if (!comment) throw new NotFoundException('Yorum bulunamadi');
    if (comment.authorId !== actorId && role !== 'CAPTAIN' && role !== 'BOARD') {
      throw new ForbiddenException('Sadece kendi yorumunuzu silebilirsiniz');
    }
    await this.prisma.boardComment.delete({ where: { id: commentId } });
    this.events.broadcastAll({ type: 'board:comment:deleted', cardId: comment.cardId, commentId, actorId });
    return { success: true };
  }

  async toggleReaction(actorId: string, commentId: string, dto: ReactCommentDto) {
    const comment = await this.prisma.boardComment.findUnique({
      where: { id: commentId },
      select: { id: true, cardId: true },
    });
    if (!comment) throw new NotFoundException('Yorum bulunamadi');
    const existing = await this.prisma.boardCommentReaction.findUnique({
      where: { commentId_memberId_emoji: { commentId, memberId: actorId, emoji: dto.emoji } },
    });
    if (existing) {
      await this.prisma.boardCommentReaction.delete({
        where: { commentId_memberId_emoji: { commentId, memberId: actorId, emoji: dto.emoji } },
      });
    } else {
      await this.prisma.boardCommentReaction.create({
        data: { commentId, memberId: actorId, emoji: dto.emoji },
      });
    }
    this.events.broadcastAll({ type: 'board:comment:updated', cardId: comment.cardId, commentId, actorId });
    return this.prisma.boardComment.findUnique({ where: { id: commentId }, select: commentSelect });
  }

  // ---- Export ----
  async exportCards(format: 'csv' | 'json'): Promise<{ body: string; mime: string; filename: string }> {
    const cards = await this.prisma.boardCard.findMany({
      where: { archivedAt: null },
      orderBy: [{ status: 'asc' }, { position: 'asc' }],
      select: cardSelect,
    });
    const today = new Date().toISOString().slice(0, 10);
    if (format === 'json') {
      return {
        body: JSON.stringify(cards, null, 2),
        mime: 'application/json',
        filename: `board-${today}.json`,
      };
    }
    // CSV
    const header = [
      'seq', 'title', 'status', 'priority', 'startAt', 'dueAt',
      'labels', 'assignees', 'checklistDone', 'checklistTotal', 'description',
    ];
    const escape = (v: unknown): string => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = cards.map((c) => {
      const labels = c.labels.map((l) => l.label.name).join(' | ');
      const assignees = c.assignees.map((a) => a.member.name).join(' | ');
      const done = c.checklist.filter((i) => i.done).length;
      return [
        `BOARD-${c.seq}`,
        c.title,
        c.status,
        c.priority,
        c.startAt ? new Date(c.startAt).toISOString().slice(0, 10) : '',
        c.dueAt ? new Date(c.dueAt).toISOString().slice(0, 10) : '',
        labels,
        assignees,
        String(done),
        String(c.checklist.length),
        c.description ?? '',
      ].map(escape).join(',');
    });
    const csv = [header.join(','), ...rows].join('\n');
    return {
      body: '﻿' + csv, // BOM ile Excel'in TR karakter'ini doğru render etmesi için
      mime: 'text/csv; charset=utf-8',
      filename: `board-${today}.csv`,
    };
  }

  // ---- Activity ----
  async getCardActivity(cardId: string) {
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    const cardLogs = await this.prisma.auditLog.findMany({
      where: { entityType: 'BOARD_CARD', entityId: cardId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, role: true } },
      },
    });
    return cardLogs;
  }

  async bulkDeleteCards(actorId: string, role: string, dto: BulkDeleteCardsDto) {
    assertWriter(role);
    const found = await this.prisma.boardCard.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, title: true },
    });
    if (found.length === 0) return { deleted: 0 };
    await this.prisma.boardCard.deleteMany({ where: { id: { in: found.map((c) => c.id) } } });
    await this.auditLogs.log(actorId, 'BOARD_CARD_BULK_DELETE', 'BOARD_CARD', 'multiple', {
      count: found.length,
      titles: found.map((c) => c.title),
    });
    for (const c of found) {
      this.events.broadcastAll({ type: 'board:card:deleted', cardId: c.id, actorId });
    }
    return { deleted: found.length };
  }

  async moveCard(actorId: string, role: string, cardId: string, dto: MoveCardDto) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    const updated = await this.prisma.boardCard.update({
      where: { id: cardId },
      data: { status: dto.status as BoardCardStatus, position: dto.position },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_MOVE', 'BOARD_CARD', cardId, { status: dto.status });
    this.events.broadcastAll({ type: 'board:card:upserted', cardId, actorId });
    return updated;
  }

  async duplicateCard(actorId: string, role: string, cardId: string) {
    assertWriter(role);
    const original = await this.prisma.boardCard.findUnique({
      where: { id: cardId },
      select: {
        title: true,
        description: true,
        status: true,
        priority: true,
        startAt: true,
        dueAt: true,
        hideCompletedChecklist: true,
        labels: { select: { labelId: true } },
        checklist: { select: { text: true, done: true, position: true } },
      },
    });
    if (!original) throw new NotFoundException('Kart bulunamadi');
    const last = await this.prisma.boardCard.findFirst({
      where: { status: original.status },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const newPosition = last ? last.position + 1 : 0;
    const created = await this.prisma.boardCard.create({
      data: {
        title: `${original.title} (kopya)`,
        description: original.description,
        status: original.status,
        priority: original.priority,
        startAt: original.startAt,
        dueAt: original.dueAt,
        hideCompletedChecklist: original.hideCompletedChecklist,
        position: newPosition,
        createdById: actorId,
        labels: original.labels.length
          ? { createMany: { data: original.labels.map((l) => ({ labelId: l.labelId })) } }
          : undefined,
        checklist: original.checklist.length
          ? {
              createMany: {
                data: original.checklist.map((c) => ({
                  text: c.text,
                  done: c.done,
                  position: c.position,
                })),
              },
            }
          : undefined,
      },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_DUPLICATE', 'BOARD_CARD', created.id, {
      sourceId: cardId,
      title: created.title,
    });
    this.events.broadcastAll({ type: 'board:card:upserted', cardId: created.id, actorId });
    return created;
  }

  async deleteCard(actorId: string, role: string, cardId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, title: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    await this.prisma.boardCard.delete({ where: { id: cardId } });
    await this.auditLogs.log(actorId, 'BOARD_CARD_DELETE', 'BOARD_CARD', cardId, { title: exists.title });
    this.events.broadcastAll({ type: 'board:card:deleted', cardId, actorId });
    return { success: true };
  }

  async addChecklistItem(actorId: string, role: string, cardId: string, dto: CreateChecklistItemDto) {
    assertWriter(role);
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    const last = await this.prisma.boardChecklistItem.findFirst({
      where: { cardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    const item = await this.prisma.boardChecklistItem.create({
      data: {
        cardId,
        text: dto.text,
        position: last ? last.position + 1 : 0,
      },
      select: { id: true, text: true, done: true, position: true, createdAt: true },
    });
    return item;
  }

  async updateChecklistItem(actorId: string, role: string, itemId: string, dto: UpdateChecklistItemDto) {
    assertWriter(role);
    const exists = await this.prisma.boardChecklistItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Madde bulunamadi');
    const data: Prisma.BoardChecklistItemUpdateInput = {};
    if (dto.text !== undefined) data.text = dto.text;
    if (dto.done !== undefined) data.done = dto.done;
    if (dto.position !== undefined) data.position = dto.position;
    return this.prisma.boardChecklistItem.update({
      where: { id: itemId },
      data,
      select: { id: true, text: true, done: true, position: true, createdAt: true },
    });
  }

  async deleteChecklistItem(actorId: string, role: string, itemId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardChecklistItem.findUnique({ where: { id: itemId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Madde bulunamadi');
    await this.prisma.boardChecklistItem.delete({ where: { id: itemId } });
    return { success: true };
  }

  async listLabels() {
    return this.prisma.boardLabel.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, color: true, createdAt: true },
    });
  }

  async createLabel(actorId: string, role: string, dto: CreateLabelDto) {
    assertWriter(role);
    const created = await this.prisma.boardLabel.create({
      data: { name: dto.name, color: dto.color },
      select: { id: true, name: true, color: true, createdAt: true },
    });
    this.events.broadcastAll({ type: 'board:label:changed', actorId });
    return created;
  }

  async deleteLabel(actorId: string, role: string, labelId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardLabel.findUnique({ where: { id: labelId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Etiket bulunamadi');
    await this.prisma.boardLabel.delete({ where: { id: labelId } });
    this.events.broadcastAll({ type: 'board:label:changed', actorId });
    return { success: true };
  }

  async setCardLabels(actorId: string, role: string, cardId: string, dto: SetCardLabelsDto) {
    assertWriter(role);
    const card = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!card) throw new NotFoundException('Kart bulunamadi');
    if (dto.labelIds.length > 0) {
      const found = await this.prisma.boardLabel.findMany({
        where: { id: { in: dto.labelIds } },
        select: { id: true },
      });
      if (found.length !== dto.labelIds.length) {
        throw new NotFoundException('Bir veya daha fazla etiket bulunamadi');
      }
    }
    await this.prisma.$transaction([
      this.prisma.boardCardLabel.deleteMany({ where: { cardId } }),
      ...(dto.labelIds.length
        ? [
            this.prisma.boardCardLabel.createMany({
              data: dto.labelIds.map((labelId) => ({ cardId, labelId })),
            }),
          ]
        : []),
    ]);
    this.events.broadcastAll({ type: 'board:card:upserted', cardId, actorId });
    return this.prisma.boardCard.findUnique({ where: { id: cardId }, select: cardSelect });
  }
}
