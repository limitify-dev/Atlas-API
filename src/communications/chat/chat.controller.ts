import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import {
  CreateConversationDto,
  SendMessageDto,
  CreateGroupDto,
  CreateChannelDto,
  UpdateGroupDto,
  AddParticipantsDto,
} from './dto';

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get('conversations')
  @ApiOperation({ summary: 'List user conversations' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getConversations(
    @CurrentUser() user: any,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.chatService.getUserConversations(
      user.id,
      user.tenantId,
      page,
      limit,
    );
  }

  @Post('conversations')
  @ApiOperation({ summary: 'Create or get a conversation with another user' })
  async createConversation(
    @CurrentUser() user: any,
    @Body() dto: CreateConversationDto,
  ) {
    return this.chatService.getOrCreateConversation(
      user.tenantId,
      user.id,
      dto.participantId,
    );
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Get a specific conversation by id' })
  async getConversationById(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.getConversationById(
      conversationId,
      user.id,
      user.tenantId,
    );
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Get messages in a conversation' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getMessages(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit: number = 50,
  ) {
    return this.chatService.getConversationMessages(
      conversationId,
      user.id,
      cursor,
      limit,
    );
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Send a message in a conversation (REST fallback)' })
  async sendMessage(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      conversationId,
      user.id,
      dto.content,
      dto.type,
    );
  }

  @Patch('conversations/:id/read')
  @ApiOperation({ summary: 'Mark a conversation as read' })
  async markAsRead(
    @CurrentUser() user: any,
    @Param('id') conversationId: string,
  ) {
    return this.chatService.markAsRead(conversationId, user.id);
  }

  @Get('contacts')
  @ApiOperation({ summary: 'Get available contacts for the current user' })
  async getContacts(@CurrentUser() user: any) {
    return this.chatService.getContacts(user.id, user.tenantId);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get total unread message count' })
  async getUnreadCount(@CurrentUser() user: any) {
    return this.chatService.getUnreadCount(user.id, user.tenantId);
  }

  // ─── Group Endpoints ───────────────────────────────────────────────

  @Post('groups')
  @ApiOperation({ summary: 'Create a group conversation' })
  async createGroup(
    @CurrentUser() user: any,
    @Body() dto: CreateGroupDto,
  ) {
    return this.chatService.createGroup(user.tenantId, user.id, dto);
  }

  @Post('groups/section')
  @ApiOperation({ summary: 'Create a group for a school section (class)' })
  async createSectionGroup(
    @CurrentUser() user: any,
    @Body() body: { sectionId: string },
  ) {
    return this.chatService.createSectionGroup(
      user.tenantId,
      body.sectionId,
      user.id,
    );
  }

  @Patch('groups/:id')
  @ApiOperation({ summary: 'Update group details' })
  async updateGroup(
    @CurrentUser() user: any,
    @Param('id') groupId: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.chatService.updateGroup(groupId, user.id, dto);
  }

  @Post('groups/:id/participants')
  @ApiOperation({ summary: 'Add participants to a group' })
  async addParticipants(
    @CurrentUser() user: any,
    @Param('id') groupId: string,
    @Body() dto: AddParticipantsDto,
  ) {
    return this.chatService.addParticipants(
      groupId,
      user.id,
      dto.participantIds,
    );
  }

  @Delete('groups/:id/participants/:userId')
  @ApiOperation({ summary: 'Remove a participant from a group' })
  async removeParticipant(
    @CurrentUser() user: any,
    @Param('id') groupId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.chatService.removeParticipant(groupId, user.id, targetUserId);
  }

  // ─── Channel Endpoints ─────────────────────────────────────────────

  @Post('channels')
  @ApiOperation({ summary: 'Create a broadcast channel' })
  async createChannel(
    @CurrentUser() user: any,
    @Body() dto: CreateChannelDto,
  ) {
    return this.chatService.createChannel(user.tenantId, user.id, dto);
  }

  @Get('channels/school')
  @ApiOperation({ summary: 'Get or create the school announcements channel' })
  async getSchoolChannel(@CurrentUser() user: any) {
    return this.chatService.getSchoolChannel(user.tenantId);
  }
}
