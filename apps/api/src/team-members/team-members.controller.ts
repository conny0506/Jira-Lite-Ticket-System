import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { TeamMembersService } from './team-members.service';

@Controller('team-members')
export class TeamMembersController {
  constructor(private readonly teamMembersService: TeamMembersService) {}

  @Get()
  list(
    @CurrentUserId() actorId: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.teamMembersService.list(actorId, activeOnly === 'true');
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateTeamMemberDto) {
    return this.teamMembersService.create(actorId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamMembersService.update(actorId, id, dto);
  }

  @Delete(':id')
  deactivate(@CurrentUserId() actorId: string, @Param('id') id: string) {
    return this.teamMembersService.deactivate(actorId, id);
  }
}
