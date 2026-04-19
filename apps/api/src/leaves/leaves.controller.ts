import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { ReviewLeaveDto } from './dto/review-leave.dto';
import { LeavesService } from './leaves.service';

@Controller('leaves')
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @Get()
  findAll() {
    return this.leavesService.findAll();
  }

  @Get('mine')
  findMine(@CurrentUserId() actorId: string) {
    return this.leavesService.findMine(actorId);
  }

  @Post()
  create(@CurrentUserId() actorId: string, @Body() dto: CreateLeaveDto) {
    return this.leavesService.create(actorId, dto);
  }

  @Patch(':id/review')
  review(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: ReviewLeaveDto,
  ) {
    return this.leavesService.review(actorId, id, dto);
  }

  @Delete(':id')
  remove(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() actorRole: string,
    @Param('id') id: string,
  ) {
    return this.leavesService.remove(actorId, id, actorRole);
  }
}
