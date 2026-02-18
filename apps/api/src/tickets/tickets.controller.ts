import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createReadStream } from 'fs';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TicketsService } from './tickets.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { BulkUpdateTicketStatusDto } from './dto/bulk-update-ticket-status.dto';
import { UpdateTicketAssigneeDto } from './dto/update-ticket-assignee.dto';
import { ReviewTicketDto } from './dto/review-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { MarkTicketsSeenDto } from './dto/mark-tickets-seen.dto';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  list(
    @CurrentUserId() actorId: string,
    @Query('projectId') projectId?: string,
  ) {
    return this.ticketsService.list(actorId, projectId);
  }

  @Get('archive')
  archive(
    @CurrentUserId() actorId: string,
    @Query('memberId') memberId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.ticketsService.archiveList(actorId, {
      memberId,
      q,
      from,
      to,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(actorId, dto);
  }

  @Patch('bulk/status')
  bulkUpdateStatus(
    @CurrentUserId() actorId: string,
    @Body() dto: BulkUpdateTicketStatusDto,
  ) {
    return this.ticketsService.bulkUpdateStatus(actorId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateStatus(actorId, id, dto);
  }

  @Patch('seen')
  markSeen(@CurrentUserId() actorId: string, @Body() dto: MarkTicketsSeenDto) {
    return this.ticketsService.markSeen(actorId, dto);
  }

  @Patch(':id/assignee')
  updateAssignee(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTicketAssigneeDto,
  ) {
    return this.ticketsService.updateAssignee(actorId, id, dto);
  }

  @Patch(':id/review')
  review(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: ReviewTicketDto,
  ) {
    return this.ticketsService.review(actorId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.ticketsService.remove(actorId, id);
  }

  @Get(':id/submissions')
  listSubmissions(@CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.ticketsService.listSubmissions(actorId, id);
  }

  @Post(':id/submissions')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadSubmission(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: CreateSubmissionDto,
    @UploadedFile() file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
  ) {
    return this.ticketsService.createSubmission(actorId, id, dto, file);
  }

  @Get('submissions/:submissionId/download')
  async downloadSubmission(
    @CurrentUserId() actorId: string,
    @Param('submissionId') submissionId: string,
    @Res() res: any,
  ) {
    const file = await this.ticketsService.getSubmissionFile(actorId, submissionId);
    if (file.mode === 'redirect') {
      return res.redirect(file.url);
    }
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    createReadStream(file.path).pipe(res);
  }
}
