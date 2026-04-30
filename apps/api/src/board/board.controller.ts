import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUserId } from '../auth/current-user-id.decorator';
import { CurrentUserRole } from '../auth/current-user-role.decorator';
import { BoardService } from './board.service';
import { BulkDeleteCardsDto } from './dto/bulk-delete-cards.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { MoveCardDto } from './dto/move-card.dto';
import { ReactCommentDto } from './dto/react-comment.dto';
import { SetCardAssigneesDto } from './dto/set-card-assignees.dto';
import { SetCardLabelsDto } from './dto/set-card-labels.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { UpdateChecklistItemDto } from './dto/update-checklist-item.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

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

  @Post('cards/:id/duplicate')
  duplicateCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.boardService.duplicateCard(actorId, role, id);
  }

  @Post('cards/bulk-delete')
  bulkDeleteCards(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Body() dto: BulkDeleteCardsDto,
  ) {
    return this.boardService.bulkDeleteCards(actorId, role, dto);
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

  // ---- Archive ----
  @Get('archived')
  listArchived(@CurrentUserId() _actorId: string) {
    return this.boardService.listArchived();
  }

  @Patch('cards/:id/archive')
  archiveCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.boardService.archiveCard(actorId, role, id);
  }

  @Patch('cards/:id/restore')
  restoreCard(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
  ) {
    return this.boardService.restoreCard(actorId, role, id);
  }

  // ---- Members ----
  @Get('members')
  listMembers(@CurrentUserId() _actorId: string) {
    return this.boardService.listMembers();
  }

  // ---- Assignees ----
  @Put('cards/:id/assignees')
  setAssignees(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('id') id: string,
    @Body() dto: SetCardAssigneesDto,
  ) {
    return this.boardService.setCardAssignees(actorId, role, id, dto);
  }

  // ---- Comments ----
  @Get('cards/:id/comments')
  listComments(@CurrentUserId() _actorId: string, @Param('id') id: string) {
    return this.boardService.listComments(id);
  }

  @Post('cards/:id/comments')
  createComment(
    @CurrentUserId() actorId: string,
    @Param('id') id: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.boardService.createComment(actorId, id, dto);
  }

  @Patch('comments/:commentId')
  updateComment(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.boardService.updateComment(actorId, role, commentId, dto);
  }

  @Delete('comments/:commentId')
  deleteComment(
    @CurrentUserId() actorId: string,
    @CurrentUserRole() role: string,
    @Param('commentId') commentId: string,
  ) {
    return this.boardService.deleteComment(actorId, role, commentId);
  }

  @Post('comments/:commentId/reactions')
  toggleReaction(
    @CurrentUserId() actorId: string,
    @Param('commentId') commentId: string,
    @Body() dto: ReactCommentDto,
  ) {
    return this.boardService.toggleReaction(actorId, commentId, dto);
  }

  // ---- Activity ----
  @Get('cards/:id/activity')
  cardActivity(@CurrentUserId() _actorId: string, @Param('id') id: string) {
    return this.boardService.getCardActivity(id);
  }
}
