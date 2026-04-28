import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BoardCardStatus, Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCardDto } from './dto/create-card.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { SetCardLabelsDto } from './dto/set-card-labels.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

const cardSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  startAt: true,
  dueAt: true,
  position: true,
  hideCompletedChecklist: true,
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
} satisfies Prisma.BoardCardSelect;

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
  ) {}

  async listCards() {
    return this.prisma.boardCard.findMany({
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }],
      select: cardSelect,
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
        startAt: dto.startAt ? new Date(dto.startAt) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        position,
        createdById: actorId,
      },
      select: cardSelect,
    });
    await this.auditLogs.log(actorId, 'BOARD_CARD_CREATE', 'BOARD_CARD', card.id, { title: card.title });
    return card;
  }

  async updateCard(actorId: string, role: string, cardId: string, dto: UpdateCardDto) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    const data: Prisma.BoardCardUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.startAt !== undefined) data.startAt = dto.startAt ? new Date(dto.startAt) : null;
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.hideCompletedChecklist !== undefined) data.hideCompletedChecklist = dto.hideCompletedChecklist;
    return this.prisma.boardCard.update({ where: { id: cardId }, data, select: cardSelect });
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
    return updated;
  }

  async deleteCard(actorId: string, role: string, cardId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardCard.findUnique({ where: { id: cardId }, select: { id: true, title: true } });
    if (!exists) throw new NotFoundException('Kart bulunamadi');
    await this.prisma.boardCard.delete({ where: { id: cardId } });
    await this.auditLogs.log(actorId, 'BOARD_CARD_DELETE', 'BOARD_CARD', cardId, { title: exists.title });
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
    return this.prisma.boardLabel.create({
      data: { name: dto.name, color: dto.color },
      select: { id: true, name: true, color: true, createdAt: true },
    });
  }

  async deleteLabel(actorId: string, role: string, labelId: string) {
    assertWriter(role);
    const exists = await this.prisma.boardLabel.findUnique({ where: { id: labelId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Etiket bulunamadi');
    await this.prisma.boardLabel.delete({ where: { id: labelId } });
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
    return this.prisma.boardCard.findUnique({ where: { id: cardId }, select: cardSelect });
  }
}
