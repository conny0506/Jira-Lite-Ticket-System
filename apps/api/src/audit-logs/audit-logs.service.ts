import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  log(actorId: string, action: string, entityType: string, entityId: string, metadata?: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: { actorId, action, entityType, entityId, metadata: metadata as any },
    });
  }

  list(filters: { entityType?: string; entityId?: string; actorId?: string; page?: number; pageSize?: number }) {
    const page = filters.page ?? 1;
    const pageSize = Math.min(filters.pageSize ?? 50, 100);
    const where = {
      ...(filters.entityType && { entityType: filters.entityType }),
      ...(filters.entityId && { entityId: filters.entityId }),
      ...(filters.actorId && { actorId: filters.actorId }),
    };
    return Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true, role: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]).then(([logs, total]) => ({ logs, total, page, pageSize }));
  }
}
