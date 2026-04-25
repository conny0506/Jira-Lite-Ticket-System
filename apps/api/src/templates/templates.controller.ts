import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  list(@CurrentUserId() _actorId: string) {
    return this.templatesService.list();
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateTemplateDto) {
    return this.templatesService.create(actorId, dto);
  }

  @Delete(':id')
  remove(@CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.templatesService.remove(actorId, id);
  }
}
