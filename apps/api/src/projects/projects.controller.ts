import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectAssigneesDto } from './dto/update-project-assignees.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  list(@CurrentUserId() actorId: string) {
    return this.projectsService.list(actorId);
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(actorId, dto);
  }

  @Patch(':id/assignees')
  updateAssignees(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProjectAssigneesDto,
  ) {
    return this.projectsService.updateAssignees(actorId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.projectsService.remove(actorId, id);
  }
}
