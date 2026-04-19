import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PasswordResetMailService } from '../auth/password-reset-mail.service';

@Injectable()
export class DeadlineSchedulerService {
  private readonly logger = new Logger(DeadlineSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsService: EventsService,
    private readonly mailService: PasswordResetMailService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async checkDeadlines() {
    const now = new Date();
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in23h = new Date(now.getTime() + 23 * 60 * 60 * 1000);

    const tickets = await this.prisma.ticket.findMany({
      where: {
        status: { not: 'DONE' },
        dueAt: { gte: in23h, lte: in24h },
        deadlineNotifiedAt: null,
      },
      select: {
        id: true,
        title: true,
        dueAt: true,
        assignees: {
          select: {
            member: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    if (tickets.length === 0) return;

    const portalBase = (process.env.WEB_ORIGIN ?? '')
      .split(',')
      .map((x) => x.trim())
      .find((x) => x.length > 0) ?? 'http://localhost:3000';

    for (const ticket of tickets) {
      const assigneeIds = ticket.assignees.map((a) => a.member.id);
      this.eventsService.broadcast(assigneeIds, {
        type: 'ticket:deadline',
        ticketId: ticket.id,
        ticketTitle: ticket.title,
        dueAt: ticket.dueAt!.toISOString(),
      });

      for (const { member } of ticket.assignees) {
        try {
          await this.mailService.sendDeadlineReminderEmail({
            to: member.email,
            name: member.name,
            ticketTitle: ticket.title,
            dueAt: ticket.dueAt!,
            portalUrl: `${portalBase.replace(/\/$/, '')}/?ticket=${encodeURIComponent(ticket.id)}`,
          });
        } catch (err) {
          this.logger.warn(
            `Deadline mail failed for ${member.email}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      await this.prisma.ticket.update({
        where: { id: ticket.id },
        data: { deadlineNotifiedAt: now },
      });

      this.logger.log(`Deadline reminder sent for ticket "${ticket.title}" (${assigneeIds.length} assignees)`);
    }
  }
}
