import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { BoardService } from './board.service';
import { CreateCardDto } from './dto/create-card.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { SetCardLabelsDto } from './dto/set-card-labels.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';

@Controller('board')
export class BoardController {
  constructor(private readonly boardService: BoardService) {}

  @Get('cards')
  listCards(@CurrentUserId() _actorId: string) {
    return this.boardService.listCards();
  }

  @Post('cards')
  createCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Body() dto: CreateCardDto,
  ) {
    return this.boardService.createCard(actorId, role, dto);
  }

  @Patch('cards/:id')
  updateCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.boardService.updateCard(actorId, role, id, dto);
  }

  @Patch('cards/:id/move')
  moveCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: MoveCardDto,
  ) {
    return this.boardService.moveCard(actorId, role, id, dto);
  }

  @Delete('cards/:id')
  deleteCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.boardService.deleteCard(actorId, role, id);
  }

  @Post('cards/:id/checklist')
  addChecklistItem(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.boardService.addChecklistItem(actorId, role, id, dto);
  }

  @Patch('checklist/:itemId')
  updateChecklistItem(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    return this.boardService.updateChecklistItem(actorId, role, itemId, dto);
  }

  @Delete('checklist/:itemId')
  deleteChecklistItem(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('itemId') itemId: string,
  ) {
    return this.boardService.deleteChecklistItem(actorId, role, itemId);
  }

  @Get('labels')
  listLabels(@CurrentUserId() _actorId: string) {
    return this.boardService.listLabels();
  }

  @Post('labels')
  createLabel(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Body() dto: CreateLabelDto,
  ) {
    return this.boardService.createLabel(actorId, role, dto);
  }

  @Delete('labels/:id')
  deleteLabel(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.boardService.deleteLabel(actorId, role, id);
  }

  @Put('cards/:id/labels')
  setCardLabels(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: SetCardLabelsDto,
  ) {
    return this.boardService.setCardLabels(actorId, role, id, dto);
  }
}
