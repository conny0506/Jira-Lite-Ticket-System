import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { PasswordResetMailService } from '../auth/password-reset-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

type MeetingRow = {
  id: string;
  scheduledAt: Date;
  meetingUrl: string;
  note: string | null;
  includeInterns?: boolean;
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

  private toMeetingResponse(row: MeetingRow) {
    return {
      id: row.id,
      scheduledAt: row.scheduledAt.toISOString(),
      meetingUrl: row.meetingUrl,
      note: row.note,
      includeInterns: row.includeInterns ?? true,
      reminderSentAt: row.reminderSentAt ? row.reminderSentAt.toISOString() : null,
      createdBy: {
        id: row.createdById,
        name: row.createdByName,
        email: row.createdByEmail,
      },
    };
  }

  private isMissingIncludeInternsColumnError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return message.toLowerCase().includes('includeinterns');
  }

  async getCurrent(actorId: string) {
    await this.authService.getActorOrThrow(actorId);
    let rows: MeetingRow[];
    try {
      rows = await this.prisma.$queryRaw<MeetingRow[]>`
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
          AND m."scheduledAt" >= NOW()
        ORDER BY m."scheduledAt" ASC
        LIMIT 1
      `;
    } catch (error) {
      if (!this.isMissingIncludeInternsColumnError(error)) throw error;
      rows = await this.prisma.$queryRaw<MeetingRow[]>`
        SELECT
          m."id",
          m."scheduledAt",
          m."meetingUrl",
          m."note",
          m."reminderSentAt",
          m."createdById",
          t."name" AS "createdByName",
          t."email" AS "createdByEmail"
        FROM "Meeting" m
        INNER JOIN "TeamMember" t ON t."id" = m."createdById"
        WHERE m."canceledAt" IS NULL
          AND m."scheduledAt" >= NOW()
        ORDER BY m."scheduledAt" ASC
        LIMIT 1
      `;
    }

    const meeting = rows[0] ? this.toMeetingResponse(rows[0]) : null;
    return { meeting };
  }

  async create(actorId: string, dto: CreateMeetingDto) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== 'CAPTAIN') {
      throw new ForbiddenException('Bu islem icin kaptan yetkisi gerekir');
    }

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

    const now = new Date();
    const meetingId = randomUUID();
    await this.prisma.$executeRaw`
      UPDATE "Meeting"
      SET "canceledAt" = ${now},
          "updatedAt" = NOW()
      WHERE "canceledAt" IS NULL
        AND "scheduledAt" >= ${now}
    `;

    let insertedRows: Array<{
      id: string;
      scheduledAt: Date;
      meetingUrl: string;
      note: string | null;
      includeInterns?: boolean;
      reminderSentAt: Date | null;
    }>;
    try {
      insertedRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        scheduledAt: Date;
        meetingUrl: string;
        note: string | null;
        includeInterns?: boolean;
        reminderSentAt: Date | null;
      }>
      >`
        INSERT INTO "Meeting" ("id", "scheduledAt", "meetingUrl", "note", "includeInterns", "createdById", "createdAt", "updatedAt")
        VALUES (${meetingId}, ${scheduledAt}, ${meetingUrl}, ${dto.note?.trim() || null}, ${includeInterns}, ${actor.id}, NOW(), NOW())
        RETURNING "id", "scheduledAt", "meetingUrl", "note", "includeInterns", "reminderSentAt"
      `;
    } catch (error) {
      if (!this.isMissingIncludeInternsColumnError(error)) throw error;
      insertedRows = await this.prisma.$queryRaw<
        Array<{
          id: string;
          scheduledAt: Date;
          meetingUrl: string;
          note: string | null;
          reminderSentAt: Date | null;
        }>
      >`
        INSERT INTO "Meeting" ("id", "scheduledAt", "meetingUrl", "note", "createdById", "createdAt", "updatedAt")
        VALUES (${meetingId}, ${scheduledAt}, ${meetingUrl}, ${dto.note?.trim() || null}, ${actor.id}, NOW(), NOW())
        RETURNING "id", "scheduledAt", "meetingUrl", "note", "reminderSentAt"
      `;
    }

    const inserted = insertedRows[0];
    if (!inserted) {
      throw new BadRequestException('Toplanti kaydi olusturulamadi');
    }

    return {
      meeting: this.toMeetingResponse({
        ...inserted,
        createdById: actor.id,
        createdByName: actor.name,
        createdByEmail: actor.email,
      }),
    };
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
        includeInterns: boolean;
      }>;
      try {
        meetings = await this.prisma.$queryRaw<
          Array<{
            id: string;
            scheduledAt: Date;
            meetingUrl: string;
            note: string | null;
            includeInterns: boolean;
          }>
        >`
          SELECT "id", "scheduledAt", "meetingUrl", "note", "includeInterns"
          FROM "Meeting"
          WHERE "canceledAt" IS NULL
            AND "reminderSentAt" IS NULL
            AND "scheduledAt" >= ${from}
            AND "scheduledAt" <= ${to}
        `;
      } catch (error) {
        if (!this.isMissingIncludeInternsColumnError(error)) throw error;
        const legacyMeetings = await this.prisma.$queryRaw<
          Array<{ id: string; scheduledAt: Date; meetingUrl: string; note: string | null }>
        >`
          SELECT "id", "scheduledAt", "meetingUrl", "note"
          FROM "Meeting"
          WHERE "canceledAt" IS NULL
            AND "reminderSentAt" IS NULL
            AND "scheduledAt" >= ${from}
            AND "scheduledAt" <= ${to}
        `;
        meetings = legacyMeetings.map((meeting) => ({ ...meeting, includeInterns: true }));
      }

      if (meetings.length === 0) return;

      for (const meeting of meetings) {
        const recipients = await this.prisma.teamMember.findMany({
          where: {
            active: true,
            notificationEmailEnabled: true,
            ...(meeting.includeInterns ? {} : { isIntern: false }),
          },
          select: {
            name: true,
            email: true,
          },
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
