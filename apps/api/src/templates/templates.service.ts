import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTemplateDto } from './dto/create-template.dto';

@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.ticketTemplate.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  create(actorId: string, dto: CreateTemplateDto) {
    return this.prisma.ticketTemplate.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        createdById: actorId,
      },
      select: {
        id: true,
        title: true,
        description: true,
        priority: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(actorId: string, id: string) {
    const template = await this.prisma.ticketTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Şablon bulunamadı');

    const actor = await this.prisma.teamMember.findUnique({ where: { id: actorId }, select: { role: true } });
    if (template.createdById !== actorId && actor?.role !== 'CAPTAIN') {
      throw new ForbiddenException('Bu şablonu silme yetkiniz yok');
    }

    await this.prisma.ticketTemplate.delete({ where: { id } });
    return { success: true };
  }
}
