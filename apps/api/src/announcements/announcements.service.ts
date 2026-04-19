import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async create(actorId: string, dto: CreateAnnouncementDto) {
    return this.prisma.announcement.create({
      data: {
        title: dto.title.trim(),
        content: dto.content.trim(),
        createdById: actorId,
      },
      select: {
        id: true,
        title: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        createdBy: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async remove(actorId: string, id: string, actorRole: string) {
    const announcement = await this.prisma.announcement.findUnique({ where: { id } });
    if (!announcement) throw new NotFoundException('Duyuru bulunamadi');
    if (announcement.createdById !== actorId && actorRole !== 'CAPTAIN' && actorRole !== 'BOARD') {
      throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
    }
    await this.prisma.announcement.delete({ where: { id } });
    return { ok: true };
  }
}
