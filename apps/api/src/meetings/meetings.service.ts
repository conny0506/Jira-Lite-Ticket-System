import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Department, TeamRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { PasswordResetMailService } from '../auth/password-reset-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

type MeetingTargetMode = 'ALL' | 'SELECTED';

type MeetingRow = {
  id: string;
  scheduledAt: Date;
  meetingUrl: string;
  note: string | null;
  includeInterns?: boolean;
  targetMode?: MeetingTargetMode;
  reminderSentAt: Date | null;
  createdById: string;
  createdByName: string;
  createdByEmail: string;
};

@Injectable()
export class MeetingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MeetingsService.name);
  private reminderTimer: NodeJS.Timeout | null = null;
  private isReminderRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly mailService: PasswordResetMailService,
  ) {}

  private toMeetingResponse(row: MeetingRow, targetDepartments: Department[]) {
    return {
      id: row.id,
      scheduledAt: row.scheduledAt.toISOString(),
      meetingUrl: row.meetingUrl,
      note: row.note,
      includeInterns: row.includeInterns ?? true,
      targetMode: row.targetMode ?? 'ALL',
      targetDepartments,
      reminderSentAt: row.reminderSentAt ? row.reminderSentAt.toISOString() : null,
      createdBy: {
        id: row.createdById,
        name: row.createdByName,
        email: row.createdByEmail,
      },
    };
  }

  private parseAndValidateMeeting(dto: CreateMeetingDto) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('Toplanti tarihi gecersiz');
    }

    const minimumStart = Date.now() + 15 * 60 * 1000;
    if (scheduledAt.getTime() <= minimumStart) {
      throw new BadRequestException('Toplanti en az 15 dakika sonrasina planlanmalidir');
    }

    const meetingUrl = dto.meetingUrl.trim();
    if (!/^https?:\/\//i.test(meetingUrl)) {
      throw new BadRequestException('Toplanti linki http:// veya https:// ile baslamalidir');
    }

    const includeInterns = dto.includeInterns ?? true;
    const targetMode = (dto.targetMode ?? 'ALL') as MeetingTargetMode;
    const targetDepartments = [...new Set((dto.targetDepartments ?? []) as Department[])];

    if (targetMode === 'SELECTED' && targetDepartments.length < 1) {
      throw new BadRequestException('Secili departman modunda en az bir departman secilmelidir');
    }

    return {
      scheduledAt,
      meetingUrl,
      note: dto.note?.trim() || null,
      includeInterns,
      targetMode,
      targetDepartments,
    };
  }

  private isMissingFieldError(error: unknown, field: string) {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes(field.toLowerCase());
  }

  private async getMeetingDepartments(meetingId: string) {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ department: Department }>>`
        SELECT "department"
        FROM "MeetingDepartment"
        WHERE "meetingId" = ${meetingId}
      `;
      return rows.map((x) => x.department);
    } catch (error) {
      if (this.isMissingFieldError(error, 'MeetingDepartment')) {
        return [] as Department[];
      }
      throw error;
    }
  }

  private async replaceMeetingDepartments(meetingId: string, departments: Department[]) {
    try {
      await this.prisma.$executeRaw`
        DELETE FROM "MeetingDepartment"
        WHERE "meetingId" = ${meetingId}
      `;
      for (const department of departments) {
        await this.prisma.$executeRaw`
          INSERT INTO "MeetingDepartment" ("meetingId", "department", "assignedAt")
          VALUES (${meetingId}, ${department}, NOW())
        `;
      }
    } catch (error) {
      if (this.isMissingFieldError(error, 'MeetingDepartment')) {
        return;
      }
      throw error;
    }
  }

  private async getCurrentMeetingRow(now: Date) {
    try {
      const rows = await this.prisma.$queryRaw<MeetingRow[]>`
        SELECT
          m."id",
          m."scheduledAt",
          m."meetingUrl",
          m."note",
          m."includeInterns",
          m."targetMode",
          m."reminderSentAt",
          m."createdById",
          t."name" AS "createdByName",
          t."email" AS "createdByEmail"
        FROM "Meeting" m
        INNER JOIN "TeamMember" t ON t."id" = m."createdById"
        WHERE m."canceledAt" IS NULL
          AND m."scheduledAt" >= ${now}
        ORDER BY m."scheduledAt" ASC
        LIMIT 1
      `;
      return rows[0] ?? null;
    } catch (error) {
      if (!this.isMissingFieldError(error, 'targetMode')) {
        throw error;
      }
      const rows = await this.prisma.$queryRaw<MeetingRow[]>`
        SELECT
          m."id",
          m."scheduledAt",
          m."meetingUrl",
          m."note",
          m."includeInterns",
          m."reminderSentAt",
          m."createdById",
          t."name" AS "createdByName",
          t."email" AS "createdByEmail"
        FROM "Meeting" m
        INNER JOIN "TeamMember" t ON t."id" = m."createdById"
        WHERE m."canceledAt" IS NULL
          AND m."scheduledAt" >= ${now}
        ORDER BY m."scheduledAt" ASC
        LIMIT 1
      `;
      const row = rows[0] ?? null;
      if (!row) return null;
      return { ...row, targetMode: 'ALL' as MeetingTargetMode };
    }
  }

  private canActorSeeMeeting(
    actor: { role: TeamRole; isIntern: boolean; departments: Array<{ department: Department }> },
    meeting: { includeInterns: boolean; targetMode: MeetingTargetMode },
    targetDepartments: Department[],
  ) {
    if (actor.role === TeamRole.CAPTAIN) return true;
    if (actor.isIntern && !meeting.includeInterns) return false;
    if (meeting.targetMode === 'ALL') return true;

    const actorDepartments = new Set(actor.departments.map((x) => x.department));
    return targetDepartments.some((x) => actorDepartments.has(x));
  }

  private async getRecipients(params: {
    includeInterns: boolean;
    targetMode: MeetingTargetMode;
    targetDepartments: Department[];
  }) {
    return this.prisma.teamMember.findMany({
      where: {
        active: true,
        notificationEmailEnabled: true,
        ...(params.includeInterns ? {} : { isIntern: false }),
        ...(params.targetMode === 'SELECTED'
          ? {
              departments: {
                some: {
                  department: { in: params.targetDepartments },
                },
              },
            }
          : {}),
      },
      select: {
        name: true,
        email: true,
      },
    });
  }

  async getCurrent(actorId: string) {
    await this.authService.getActorOrThrow(actorId);
    const actor = await this.prisma.teamMember.findUnique({
      where: { id: actorId },
      select: {
        role: true,
        isIntern: true,
        departments: { select: { department: true } },
      },
    });

    const row = await this.getCurrentMeetingRow(new Date());
    if (!row || !actor) return { meeting: null };

    const targetDepartments = await this.getMeetingDepartments(row.id);
    const includeInterns = row.includeInterns ?? true;
    const targetMode = row.targetMode ?? 'ALL';

    if (!this.canActorSeeMeeting(actor, { includeInterns, targetMode }, targetDepartments)) {
      return { meeting: null };
    }

    return {
      meeting: this.toMeetingResponse(
        { ...row, includeInterns, targetMode },
        targetDepartments,
      ),
    };
  }

  async create(actorId: string, dto: CreateMeetingDto) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new ForbiddenException('Bu islem icin kaptan yetkisi gerekir');
    }

    const parsed = this.parseAndValidateMeeting(dto);
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE "Meeting"
      SET "canceledAt" = ${now},
          "updatedAt" = NOW()
      WHERE "canceledAt" IS NULL
        AND "scheduledAt" >= ${now}
    `;

    const meetingId = randomUUID();
    try {
      await this.prisma.$executeRaw`
        INSERT INTO "Meeting" ("id", "scheduledAt", "meetingUrl", "note", "includeInterns", "targetMode", "createdById", "createdAt", "updatedAt")
        VALUES (${meetingId}, ${parsed.scheduledAt}, ${parsed.meetingUrl}, ${parsed.note}, ${parsed.includeInterns}, ${parsed.targetMode}, ${actor.id}, NOW(), NOW())
      `;
    } catch (error) {
      if (!this.isMissingFieldError(error, 'targetMode')) throw error;
      await this.prisma.$executeRaw`
        INSERT INTO "Meeting" ("id", "scheduledAt", "meetingUrl", "note", "includeInterns", "createdById", "createdAt", "updatedAt")
        VALUES (${meetingId}, ${parsed.scheduledAt}, ${parsed.meetingUrl}, ${parsed.note}, ${parsed.includeInterns}, ${actor.id}, NOW(), NOW())
      `;
    }

    if (parsed.targetMode === 'SELECTED') {
      await this.replaceMeetingDepartments(meetingId, parsed.targetDepartments);
    }

    const row = await this.getCurrentMeetingRow(now);
    if (!row) throw new BadRequestException('Toplanti kaydi olusturulamadi');
    const targetDepartments = await this.getMeetingDepartments(row.id);
    return {
      meeting: this.toMeetingResponse(
        { ...row, includeInterns: row.includeInterns ?? true, targetMode: row.targetMode ?? 'ALL' },
        targetDepartments,
      ),
    };
  }

  async updateCurrent(actorId: string, dto: CreateMeetingDto) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new ForbiddenException('Bu islem icin kaptan yetkisi gerekir');
    }

    const current = await this.getCurrentMeetingRow(new Date());
    if (!current) throw new BadRequestException('Guncellenecek planli toplanti bulunamadi');

    const parsed = this.parseAndValidateMeeting(dto);
    const oldScheduledAt = current.scheduledAt;

    try {
      await this.prisma.$executeRaw`
        UPDATE "Meeting"
        SET "scheduledAt" = ${parsed.scheduledAt},
            "meetingUrl" = ${parsed.meetingUrl},
            "note" = ${parsed.note},
            "includeInterns" = ${parsed.includeInterns},
            "targetMode" = ${parsed.targetMode},
            "reminderSentAt" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${current.id}
      `;
    } catch (error) {
      if (!this.isMissingFieldError(error, 'targetMode')) throw error;
      await this.prisma.$executeRaw`
        UPDATE "Meeting"
        SET "scheduledAt" = ${parsed.scheduledAt},
            "meetingUrl" = ${parsed.meetingUrl},
            "note" = ${parsed.note},
            "includeInterns" = ${parsed.includeInterns},
            "reminderSentAt" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${current.id}
      `;
    }

    if (parsed.targetMode === 'SELECTED') {
      await this.replaceMeetingDepartments(current.id, parsed.targetDepartments);
    } else {
      await this.replaceMeetingDepartments(current.id, []);
    }

    const row = await this.getCurrentMeetingRow(new Date());
    if (!row) throw new BadRequestException('Toplanti guncellenemedi');
    const targetDepartments = await this.getMeetingDepartments(row.id);
    const includeInterns = row.includeInterns ?? true;
    const targetMode = row.targetMode ?? 'ALL';

    const recipients = await this.getRecipients({ includeInterns, targetMode, targetDepartments });
    for (const user of recipients) {
      try {
        await this.mailService.sendMeetingUpdatedEmail({
          to: user.email,
          name: user.name,
          oldScheduledAt,
          newScheduledAt: row.scheduledAt,
          meetingUrl: row.meetingUrl,
          note: row.note ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(`Meeting update mail failed for ${user.email}: ${message}`);
      }
    }

    return {
      meeting: this.toMeetingResponse({ ...row, includeInterns, targetMode }, targetDepartments),
    };
  }

  async cancelCurrent(actorId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new ForbiddenException('Bu islem icin kaptan yetkisi gerekir');
    }

    const current = await this.getCurrentMeetingRow(new Date());
    if (!current) throw new BadRequestException('Iptal edilecek planli toplanti bulunamadi');

    await this.prisma.$executeRaw`
      UPDATE "Meeting"
      SET "canceledAt" = ${new Date()},
          "updatedAt" = NOW()
      WHERE "id" = ${current.id}
    `;

    const targetDepartments = await this.getMeetingDepartments(current.id);
    const includeInterns = current.includeInterns ?? true;
    const targetMode = current.targetMode ?? 'ALL';

    const recipients = await this.getRecipients({ includeInterns, targetMode, targetDepartments });
    for (const user of recipients) {
      try {
        await this.mailService.sendMeetingCanceledEmail({
          to: user.email,
          name: user.name,
          scheduledAt: current.scheduledAt,
          meetingUrl: current.meetingUrl,
          note: current.note ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.error(`Meeting cancel mail failed for ${user.email}: ${message}`);
      }
    }

    return { ok: true };
  }

  onModuleInit() {
    this.reminderTimer = setInterval(() => {
      void this.sendUpcomingMeetingReminders();
    }, 60_000);

    setTimeout(() => {
      void this.sendUpcomingMeetingReminders();
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.reminderTimer) {
      clearInterval(this.reminderTimer);
      this.reminderTimer = null;
    }
  }

  private async sendUpcomingMeetingReminders() {
    if (this.isReminderRunning) return;
    this.isReminderRunning = true;

    try {
      const now = new Date();
      const from = new Date(now.getTime() + 14 * 60 * 1000);
      const to = new Date(now.getTime() + 16 * 60 * 1000);

      let meetings: Array<{
        id: string;
        scheduledAt: Date;
        meetingUrl: string;
        note: string | null;
        includeInterns?: boolean;
        targetMode?: MeetingTargetMode;
      }>;

      try {
        meetings = await this.prisma.$queryRaw<
          Array<{
            id: string;
            scheduledAt: Date;
            meetingUrl: string;
            note: string | null;
            includeInterns?: boolean;
            targetMode?: MeetingTargetMode;
          }>
        >`
          SELECT "id", "scheduledAt", "meetingUrl", "note", "includeInterns", "targetMode"
          FROM "Meeting"
          WHERE "canceledAt" IS NULL
            AND "reminderSentAt" IS NULL
            AND "scheduledAt" >= ${from}
            AND "scheduledAt" <= ${to}
        `;
      } catch (error) {
        if (!this.isMissingFieldError(error, 'targetMode')) throw error;
        meetings = await this.prisma.$queryRaw<
          Array<{
            id: string;
            scheduledAt: Date;
            meetingUrl: string;
            note: string | null;
            includeInterns?: boolean;
          }>
        >`
          SELECT "id", "scheduledAt", "meetingUrl", "note", "includeInterns"
          FROM "Meeting"
          WHERE "canceledAt" IS NULL
            AND "reminderSentAt" IS NULL
            AND "scheduledAt" >= ${from}
            AND "scheduledAt" <= ${to}
        `;
      }

      if (meetings.length === 0) return;

      for (const meeting of meetings) {
        const targetDepartments = await this.getMeetingDepartments(meeting.id);
        const recipients = await this.getRecipients({
          includeInterns: meeting.includeInterns ?? true,
          targetMode: meeting.targetMode ?? 'ALL',
          targetDepartments,
        });

        for (const user of recipients) {
          try {
            await this.mailService.sendMeetingReminderEmail({
              to: user.email,
              name: user.name,
              scheduledAt: meeting.scheduledAt,
              meetingUrl: meeting.meetingUrl,
              note: meeting.note ?? undefined,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'unknown';
            this.logger.error(`Meeting reminder mail failed for ${user.email}: ${message}`);
          }
        }

        await this.prisma.$executeRaw`
          UPDATE "Meeting"
          SET "reminderSentAt" = ${new Date()},
              "updatedAt" = NOW()
          WHERE "id" = ${meeting.id}
        `;
      }
    } finally {
      this.isReminderRunning = false;
    }
  }
}
