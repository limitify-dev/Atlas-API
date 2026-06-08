import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { jwtConstants } from '../../auth/constant';
import { ChatService } from './chat.service';

interface AuthenticatedSocket extends Socket {
  user: {
    sub: string;
    tenantId: string | null;
    username: string;
    role: string;
    userType: string;
  };
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/chat',
  // Shorten heartbeat window so abrupt app/tab closes are reflected in presence quickly.
  pingInterval: 5000,
  pingTimeout: 7000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  // Track which users are connected (userId -> Set of socketIds)
  private connectedUsers = new Map<string, Set<string>>();
  // Track tenant scope for each connected user (userId -> tenantId)
  private userTenants = new Map<string, string>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    @InjectQueue('push-notifications') private readonly pushQueue: Queue,
  ) {}

  private formatPushSenderName(fullName?: string | null): string {
    const cleaned = (fullName || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return 'Someone';

    const parts = cleaned.split(' ');
    if (parts.length < 2) return cleaned;

    const firstName = parts[0];
    const lastName = parts[parts.length - 1];
    return `${firstName} ${lastName.charAt(0).toUpperCase()}.`;
  }

  private buildMessagePreview(content?: string | null): string {
    const text = String(content || '').trim();
    if (!text) return 'New message';
    return text.length > 120 ? `${text.slice(0, 120).trimEnd()}...` : text;
  }

  private getOnlineUsersInTenant(tenantId: string): string[] {
    const online: string[] = [];
    for (const [userId, userTenantId] of this.userTenants.entries()) {
      if (userTenantId === tenantId && this.isUserOnline(userId)) {
        online.push(userId);
      }
    }
    return online;
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: jwtConstants.secret,
      });

      client.user = payload;

      // Studio/platform users don't participate in tenant chat.
      if (!payload.tenantId) {
        this.logger.debug(
          `User ${payload.username} (${payload.sub}) has no tenant chat scope; disconnecting socket ${client.id}`,
        );
        client.disconnect();
        return;
      }

      // Track connected user
      if (!this.connectedUsers.has(payload.sub)) {
        this.connectedUsers.set(payload.sub, new Set());
      }
      this.connectedUsers.get(payload.sub)!.add(client.id);
      this.userTenants.set(payload.sub, payload.tenantId);

      // Join tenant room
      client.join(`tenant:${payload.tenantId}`);

      // Send current tenant presence snapshot to newly connected socket.
      this.server.to(client.id).emit('presence_snapshot', {
        onlineUserIds: this.getOnlineUsersInTenant(payload.tenantId),
      });

      // Broadcast that this user is online to tenant members.
      this.server.to(`tenant:${payload.tenantId}`).emit('user_presence', {
        userId: payload.sub,
        isOnline: true,
      });

      // Auto-join all user conversation rooms for real-time updates
      const conversationIds = await this.chatService.getUserConversationIds(
        payload.sub,
        payload.tenantId,
      );
      for (const conversationId of conversationIds) {
        client.join(`conversation:${conversationId}`);
      }

      this.logger.log(
        `User ${payload.username} (${payload.sub}) connected via socket ${client.id}`,
      );
    } catch (error) {
      this.logger.warn(`Client ${client.id} auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (client.user) {
      const userSockets = this.connectedUsers.get(client.user.sub);
      if (userSockets) {
        userSockets.delete(client.id);
        if (userSockets.size === 0) {
          this.connectedUsers.delete(client.user.sub);
          if (client.user.tenantId) {
            this.server
              .to(`tenant:${client.user.tenantId}`)
              .emit('user_presence', {
                userId: client.user.sub,
                isOnline: false,
              });
          }
          this.userTenants.delete(client.user.sub);
        }
      }
      this.logger.log(
        `User ${client.user.username} disconnected (socket ${client.id})`,
      );
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const room = `conversation:${data.conversationId}`;
    client.join(room);
    this.logger.debug(`User ${client.user.sub} joined ${room}`);
    return { event: 'joined', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const room = `conversation:${data.conversationId}`;
    client.leave(room);
    return { event: 'left', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { conversationId: string; content: string; type?: string },
  ) {
    try {
      const message = await this.chatService.sendMessage(
        data.conversationId,
        client.user.sub,
        data.content,
        data.type || 'TEXT',
      );

      // Broadcast to the conversation room
      const room = `conversation:${data.conversationId}`;
      this.server.to(room).emit('new_message', message);

      // Also emit conversation update to all participants (for inbox list updates)
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          data.conversationId,
          client.user.sub,
        );

      for (const participantId of participantIds) {
        let isJoinedToRoom = false;

        // Notify via Socket.io if user is online
        const participantSockets = this.connectedUsers.get(participantId);
        if (participantSockets && participantSockets.size > 0) {
          for (const socketId of participantSockets) {
            // Check if this socket is in the conversation room
            const socket = (this.server.sockets as any).get(socketId);
            if (
              socket &&
              socket.rooms.has(`conversation:${data.conversationId}`)
            ) {
              isJoinedToRoom = true;
            }

            // Emit conversation update (for list view)
            this.server.to(socketId).emit('conversation_updated', {
              conversationId: data.conversationId,
              lastMessage: {
                id: message.id,
                content: message.content,
                type: message.type,
                senderId: message.senderId,
                senderName: message.sender.name,
                createdAt: message.createdAt,
              },
            });

            // Emit new message (for active chat view) - ensures delivery even if not in room
            this.server.to(socketId).emit('new_message', message);
          }
        }

        // Enqueue push notification if user is NOT looking at the conversation
        if (!isJoinedToRoom) {
          const pushSenderName = this.formatPushSenderName(message.sender.name);
          const messagePreview = this.buildMessagePreview(message.content);
          const conversationType = message.conversation?.type || 'DIRECT';
          const isGroup = conversationType === 'GROUP';
          const isChannel = conversationType === 'CHANNEL';
          const isGroupLike = isGroup || isChannel;
          const pushTitle = isGroupLike
            ? message.conversation?.name || 'Group'
            : pushSenderName;
          const pushBody = isGroup
            ? `${pushSenderName}: ${messagePreview}`
            : messagePreview;

          this.pushQueue
            .add(
              'send-push-bulk',
              {
                userIds: [participantId],
                title: pushTitle,
                body: pushBody,
                data: {
                  type: 'chat_message',
                  conversationId: data.conversationId,
                  messageId: message.id,
                  senderId: message.senderId,
                  senderName: pushSenderName,
                  senderRole: message.sender.role,
                  senderAvatar: message.sender.avatar || null,
                  conversationType,
                  conversationName: message.conversation?.name || null,
                  conversationAvatar: message.conversation?.avatar || null,
                },
              },
              { attempts: 2, backoff: { type: 'fixed', delay: 3000 } },
            )
            .catch((err) =>
              this.logger.warn(`Push enqueue for ${participantId} failed: ${err.message}`),
            );
        }
      }

      return { event: 'message_sent', data: message };
    } catch (error) {
      this.logger.error(`send_message error: ${error.message}`);
      return { event: 'error', data: { message: error.message } };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    // Notify room (for people inside the chat screen)
    const room = `conversation:${data.conversationId}`;
    client.to(room).emit('user_typing', {
      conversationId: data.conversationId,
      userId: client.user.sub,
    });

    // Notify participants (for people in the inbox list)
    try {
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          data.conversationId,
          client.user.sub,
        );

      for (const participantId of participantIds) {
        const participantSockets = this.connectedUsers.get(participantId);
        if (participantSockets) {
          for (const socketId of participantSockets) {
            this.server.to(socketId).emit('user_typing', {
              conversationId: data.conversationId,
              userId: client.user.sub,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast typing status: ${error.message}`);
    }
  }

  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    await this.chatService.markAsRead(data.conversationId, client.user.sub);

    const eventData = {
      conversationId: data.conversationId,
      userId: client.user.sub,
      readAt: new Date(),
    };

    // Notify room
    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('messages_read', eventData);

    // Also notify participants directly (robustness)
    try {
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          data.conversationId,
          client.user.sub,
        );

      for (const participantId of participantIds) {
        const participantSockets = this.connectedUsers.get(participantId);
        if (participantSockets) {
          for (const socketId of participantSockets) {
            this.server.to(socketId).emit('messages_read', eventData);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast read receipt: ${error.message}`);
    }
  }

  /**
   * Check if a user is currently connected via WebSocket
   */
  isUserOnline(userId: string): boolean {
    return (
      this.connectedUsers.has(userId) &&
      this.connectedUsers.get(userId)!.size > 0
    );
  }
}
