import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { AuditLogsService } from './audit-logs.service';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';

@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  list(
    @CurrentUserId() _actorId: string,
    @CurrentUserRole() actorRole: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (actorRole !== 'CAPTAIN' && actorRole !== 'BOARD') {
      throw new ForbiddenException('Bu islemi yapma yetkiniz yok');
    }
    return this.auditLogsService.list({
      entityType,
      entityId,
      actorId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }
}
