import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCalendarNoteDto } from './dto/create-calendar-note.dto';

const NOTE_WRITER_ROLES = ['CAPTAIN', 'RD_LEADER', 'ADMIN'];

@Injectable()
export class CalendarNotesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(month: string) {
    // month format: YYYY-MM
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(year, mon - 1, 1);
    const end = new Date(year, mon, 1);
    return this.prisma.calendarNote.findMany({
      where: { date: { gte: start, lt: end } },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        date: true,
        content: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async create(actorId: string, role: string, dto: CreateCalendarNoteDto) {
    if (!NOTE_WRITER_ROLES.includes(role)) {
      throw new ForbiddenException('Takvim notu sadece kaptan, alan lideri veya admin tarafından eklenebilir');
    }
    const date = new Date(dto.date);
    const note = await this.prisma.calendarNote.create({
      data: { date, content: dto.content, createdById: actorId },
      select: {
        id: true,
        date: true,
        content: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
    return note;
  }

  async remove(actorId: string, role: string, id: string) {
    const note = await this.prisma.calendarNote.findUnique({
      where: { id },
      select: { id: true, createdById: true },
    });
    if (!note) throw new NotFoundException('Not bulunamadi');
    if (note.createdById !== actorId && !NOTE_WRITER_ROLES.includes(role)) {
      throw new ForbiddenException('Bu notu silme yetkiniz yok');
    }
    await this.prisma.calendarNote.delete({ where: { id } });
    return { success: true };
  }
}
