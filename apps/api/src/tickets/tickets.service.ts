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
import { BulkUpdateTicketStatusDto } from './dto/bulk-update-ticket-status.dto';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketAssigneeDto } from './dto/update-ticket-assignee.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

@Injectable()
export class TicketsService {
  private readonly systemProjectKey = 'ULGEN-SYSTEM';
  private readonly systemProjectName = 'Ülgen AR-GE Görev Merkezi';
  private readonly maxUploadSizeBytes = 25 * 1024 * 1024;
  private readonly allowedExtensions = new Set(['.pdf', '.doc', '.docx', '.ppt', '.pptx']);

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

  async bulkUpdateStatus(actorId: string, dto: BulkUpdateTicketStatusDto) {
    await this.assertCaptain(actorId);
    const ticketIds = [...new Set(dto.ticketIds)];
    if (ticketIds.length === 0) {
      throw new BadRequestException('Toplu guncelleme icin en az bir gorev secilmelidir');
    }
    const existing = await this.prisma.ticket.findMany({
      where: { id: { in: ticketIds } },
      select: { id: true },
    });
    const foundIds = existing.map((x) => x.id);
    const missingIds = ticketIds.filter((id) => !foundIds.includes(id));
    if (foundIds.length === 0) {
      throw new NotFoundException('Secilen gorevler bulunamadi');
    }

    const completedAt = dto.status === 'DONE' ? new Date() : null;
    const result = await this.prisma.ticket.updateMany({
      where: { id: { in: foundIds } },
      data: {
        status: dto.status,
        completedAt,
      },
    });

    await Promise.all(
      foundIds.map((ticketId) =>
        this.queueService.addTicketEvent({
          ticketId,
          event: 'updated',
        }),
      ),
    );

    return {
      ok: true,
      status: dto.status,
      updatedCount: result.count,
      ticketIds: foundIds,
      failedIds: missingIds,
      partial: missingIds.length > 0,
    };
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
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('BoÅŸ dosya kabul edilmez');
    }
    const ext = this.extractExtension(file.originalname);
    if (!ext) {
      throw new BadRequestException('Sadece PDF, DOC, DOCX, PPT, PPTX kabul edilir');
    }
    if (file.size > this.maxUploadSizeBytes) {
      throw new BadRequestException('Maksimum dosya boyutu 25 MB olabilir');
    }
    if (!this.matchesFileSignature(file.buffer, ext)) {
      throw new BadRequestException('Dosya iÃ§eriÄŸi uzantÄ± ile uyuÅŸmuyor');
    }
    const safeFileName = this.sanitizeFileName(file.originalname, ext);
    const normalizedMimeType = this.normalizeMimeType(ext);

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
    const stored = await this.storageService.storeSubmissionFile({
      ...file,
      originalname: safeFileName,
      mimetype: normalizedMimeType,
    });

    return this.prisma.submission.create({
      data: {
        ticketId,
        submittedById: dto.submittedById,
        fileName: safeFileName,
        storageName: stored.storageName,
        mimeType: normalizedMimeType,
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
    return this.allowedExtensions.has(ext) ? ext : '';
  }

  private sanitizeFileName(original: string, extension: string) {
    const withoutPath = original.replace(/[/\\]/g, '');
    const noControlChars = withoutPath.replace(/[\u0000-\u001F\u007F]/g, '');
    const base = noControlChars.replace(/\.[^.]+$/, '').trim();
    const safeBase = base.length > 0 ? base : 'submission';
    const clippedBase = safeBase.slice(0, 120);
    return `${clippedBase}${extension}`;
  }

  private normalizeMimeType(extension: string) {
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    };
    return map[extension] ?? 'application/octet-stream';
  }

  private matchesFileSignature(buffer: Buffer, extension: string) {
    if (extension === '.pdf') {
      return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '%PDF';
    }
    if (extension === '.doc' || extension === '.ppt') {
      const oleHeader = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
      if (buffer.length < oleHeader.length) return false;
      return oleHeader.every((byte, idx) => buffer[idx] === byte);
    }
    if (extension === '.docx' || extension === '.pptx') {
      if (buffer.length < 4) return false;
      return (
        buffer[0] === 0x50 &&
        buffer[1] === 0x4b &&
        (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
        (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
      );
    }
    return false;
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

