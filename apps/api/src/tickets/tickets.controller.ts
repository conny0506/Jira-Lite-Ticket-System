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
import { UpdateTicketAssigneeDto } from './dto/update-ticket-assignee.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';

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

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateTicketDto) {
    return this.ticketsService.create(actorId, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.ticketsService.updateStatus(actorId, id, dto);
  }

  @Patch(':id/assignee')
  updateAssignee(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTicketAssigneeDto,
  ) {
    return this.ticketsService.updateAssignee(actorId, id, dto);
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
  @UseInterceptors(FileInterceptor('file'))
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
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(file.fileName)}"`,
    );
    createReadStream(file.path).pipe(res);
  }
}
