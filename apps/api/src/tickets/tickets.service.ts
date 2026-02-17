import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { StorageService } from '../storage/storage.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketAssigneeDto } from './dto/update-ticket-assignee.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Injectable()
export class TicketsService {
  private readonly systemProjectKey = 'ULGEN-SYSTEM';
  private readonly systemProjectName = 'Ülgen AR-GE Görev Merkezi';
  private readonly allowedMimeTypes = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly authService: AuthService,
    private readonly storageService: StorageService,
  ) {}

  async list(actorId: string, projectId?: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    return this.prisma.ticket.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(actor.role === TeamRole.CAPTAIN
          ? {}
          : {
              OR: [
                {
                  assignees: {
                    some: {
                      memberId: actor.id,
                    },
                  },
                },
                {
                  project: {
                    assignments: {
                      some: {
                        memberId: actor.id,
                      },
                    },
                  },
                },
              ],
            }),
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        assignees: {
          include: {
            member: {
              select: { id: true, name: true, role: true, active: true },
            },
          },
        },
        submissions: {
          orderBy: { createdAt: 'desc' },
          include: {
            submittedBy: { select: { id: true, name: true, role: true } },
          },
        },
      },
    });
  }

  async create(actorId: string, dto: CreateTicketDto) {
    await this.assertCaptain(actorId);
    const projectId =
      dto.projectId ?? (await this.ensureSystemProject(actorId)).id;
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Proje bulunamadı');

    const assigneeIds = [...new Set(dto.assigneeIds ?? [])];
    await this.ensureActiveMembers(assigneeIds);

    const ticket = await this.prisma.ticket.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        assignees:
          assigneeIds.length > 0
            ? {
                createMany: {
                  data: assigneeIds.map((memberId) => ({ memberId })),
                },
              }
            : undefined,
      },
      include: {
        assignees: {
          include: {
            member: { select: { id: true, name: true, role: true, active: true } },
          },
        },
      },
    });
    await this.queueService.addTicketEvent({
      ticketId: ticket.id,
      event: 'created',
    });
    return ticket;
  }

  async updateStatus(actorId: string, id: string, dto: UpdateTicketStatusDto) {
    const actor = await this.authService.getActorOrThrow(actorId);
    const exists = await this.prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        assignees: { select: { memberId: true } },
      },
    });
    if (!exists) throw new NotFoundException('Görev bulunamadı');
    const assignedIds = exists.assignees.map((item) => item.memberId);
    if (actor.role !== TeamRole.CAPTAIN && !assignedIds.includes(actor.id)) {
      throw new BadRequestException(
        'Durumu sadece kaptan veya atanan üye güncelleyebilir',
      );
    }

    const ticket = await this.prisma.ticket.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === 'DONE' ? new Date() : null,
      },
    });
    await this.queueService.addTicketEvent({
      ticketId: ticket.id,
      event: 'updated',
    });
    return ticket;
  }

  async updateAssignee(
    actorId: string,
    id: string,
    dto: UpdateTicketAssigneeDto,
  ) {
    await this.assertCaptain(actorId);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Görev bulunamadı');

    const assigneeIds = [...new Set(dto.assigneeIds ?? [])];
    await this.ensureActiveMembers(assigneeIds);
    await this.prisma.$transaction([
      this.prisma.ticketAssignment.deleteMany({ where: { ticketId: id } }),
      this.prisma.ticketAssignment.createMany({
        data: assigneeIds.map((memberId) => ({ ticketId: id, memberId })),
      }),
    ]);

    return this.prisma.ticket.findUnique({
      where: { id },
      include: {
        assignees: {
          include: {
            member: { select: { id: true, name: true, role: true, active: true } },
          },
        },
      },
    });
  }

  async remove(actorId: string, id: string) {
    await this.assertCaptain(actorId);
    const ticket = await this.prisma.ticket.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Görev bulunamadı');
    return this.prisma.ticket.delete({ where: { id } });
  }

  async listSubmissions(actorId: string, ticketId: string) {
    await this.assertTicketAccess(actorId, ticketId);
    return this.prisma.submission.findMany({
      where: { ticketId },
      orderBy: { createdAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async createSubmission(
    actorId: string,
    ticketId: string,
    dto: CreateSubmissionDto,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    if (!file) throw new BadRequestException('Dosya zorunludur');
    const ext = this.extractExtension(file.originalname);
    const hasAllowedMime = this.allowedMimeTypes.has(file.mimetype);
    if (!hasAllowedMime && !(file.mimetype === 'application/octet-stream' && ext)) {
      throw new BadRequestException('Sadece PDF, DOC, DOCX, PPT, PPTX kabul edilir');
    }
    if (file.size > 25 * 1024 * 1024) {
      throw new BadRequestException('Maksimum dosya boyutu 25 MB olabilir');
    }

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { id: true },
    });
    if (!ticket) throw new NotFoundException('Görev bulunamadı');
    await this.assertTicketAccess(actorId, ticketId);

    if (dto.submittedById !== actorId) {
      throw new BadRequestException('submittedById alanı giriş yapan kullanıcı ile aynı olmalıdır');
    }
    await this.ensureActiveMembers([dto.submittedById]);
    const stored = await this.storageService.storeSubmissionFile(file);

    return this.prisma.submission.create({
      data: {
        ticketId,
        submittedById: dto.submittedById,
        fileName: file.originalname,
        storageName: stored.storageName,
        mimeType: file.mimetype,
        size: file.size,
        note: dto.note,
      },
      include: {
        submittedBy: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async getSubmissionFile(actorId: string, id: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id },
      select: {
        id: true,
        ticketId: true,
        storageName: true,
        fileName: true,
        mimeType: true,
      },
    });
    if (!submission) throw new NotFoundException('Teslim kaydı bulunamadı');
    await this.assertTicketAccess(actorId, submission.ticketId);

    const target = await this.storageService.resolveDownloadTarget(
      submission.storageName,
      submission.fileName,
      submission.mimeType,
    );
    return { ...target, fileName: submission.fileName, mimeType: submission.mimeType };
  }

  private extractExtension(name: string) {
    const dot = name.lastIndexOf('.');
    if (dot < 0) return '';
    const ext = name.slice(dot).toLowerCase();
    const allowed = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx']);
    return allowed.has(ext) ? ext : '';
  }

  private async ensureActiveMembers(memberIds: string[]) {
    if (memberIds.length === 0) return;
    const unique = [...new Set(memberIds)];
    const count = await this.prisma.teamMember.count({
      where: { id: { in: unique }, active: true },
    });
    if (count !== unique.length) {
      throw new BadRequestException('Tüm atananlar aktif takım üyesi olmalıdır');
    }
  }

  private async assertCaptain(actorId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new BadRequestException('Görevleri sadece kaptan yönetebilir');
    }
  }

  private async assertTicketAccess(actorId: string, ticketId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role === TeamRole.CAPTAIN) return;

    const accessible = await this.prisma.ticket.findFirst({
      where: {
        id: ticketId,
        OR: [
          {
            assignees: {
              some: { memberId: actor.id },
            },
          },
          {
            project: {
              assignments: {
                some: { memberId: actor.id },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!accessible) {
      throw new BadRequestException('Bu göreve erişim yetkiniz yok');
    }
  }

  private async ensureSystemProject(actorId: string) {
    return this.prisma.project.upsert({
      where: { key: this.systemProjectKey },
      update: {},
      create: {
        key: this.systemProjectKey,
        name: this.systemProjectName,
        description:
          'Takım görevleri ve teslimleri için sistem tarafından yönetilen varsayılan proje',
        assignments: {
          create: {
            memberId: actorId,
          },
        },
      },
      select: { id: true },
    });
  }
}
