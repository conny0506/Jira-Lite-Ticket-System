import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { ReviewLeaveDto } from './dto/review-leave.dto';

@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(actorRole: string) {
    if (actorRole !== 'CAPTAIN' && actorRole !== 'BOARD') {
      throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
    }
    return this.prisma.leave.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        member: { select: { id: true, name: true, role: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  async findMine(memberId: string) {
    return this.prisma.leave.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  async create(memberId: string, dto: CreateLeaveDto) {
    const start = new Date(dto.startDate);
    const end = new Date(dto.endDate);
    if (end < start) throw new BadRequestException('Bitis tarihi baslangic tarihinden once olamaz');
    return this.prisma.leave.create({
      data: {
        memberId,
        startDate: start,
        endDate: end,
        reason: dto.reason.trim(),
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
      },
    });
  }

  async review(actorId: string, actorRole: string, id: string, dto: ReviewLeaveDto) {
    if (actorRole !== 'CAPTAIN' && actorRole !== 'BOARD') {
      throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
    }
    const leave = await this.prisma.leave.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Izin talebi bulunamadi');
    if (leave.status !== 'PENDING') throw new BadRequestException('Bu talep zaten incelendi');
    return this.prisma.leave.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedById: actorId,
        reviewNote: dto.reviewNote?.trim() ?? null,
      },
      select: {
        id: true,
        status: true,
        reviewNote: true,
        reviewedBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(actorId: string, id: string, actorRole: string) {
    const leave = await this.prisma.leave.findUnique({ where: { id } });
    if (!leave) throw new NotFoundException('Izin talebi bulunamadi');
    if (leave.memberId !== actorId && actorRole !== 'CAPTAIN' && actorRole !== 'BOARD') {
      throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
    }
    await this.prisma.leave.delete({ where: { id } });
    return { ok: true };
  }
}
