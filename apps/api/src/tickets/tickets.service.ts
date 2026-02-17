import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Injectable()
export class TicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  list(projectId?: string) {
    return this.prisma.ticket.findMany({
      where: projectId ? { projectId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(dto: CreateTicketDto) {
    const project = await this.prisma.project.findUnique({
      where: { id: dto.projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const ticket = await this.prisma.ticket.create({
      data: {
        projectId: dto.projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
      },
    });
    await this.queueService.addTicketEvent({
      ticketId: ticket.id,
      event: 'created',
    });
    return ticket;
  }

  async updateStatus(id: string, dto: UpdateTicketStatusDto) {
    const exists = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Ticket not found');

    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: { status: dto.status },
    });
    await this.queueService.addTicketEvent({
      ticketId: ticket.id,
      event: 'updated',
    });
    return ticket;
  }
}
