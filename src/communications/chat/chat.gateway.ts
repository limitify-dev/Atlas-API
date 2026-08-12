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
import { ChatPresenceService } from './chat-presence.service';
import { getAllowedOrigins } from '../../common/config/cors-origins';
import { OnEvent } from '@nestjs/event-emitter';

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
  // Native app clients (Socket.IO over React Native) don't send an Origin
  // header, so this restriction only affects browser-based connections
  // (atlas.ui) — same reasoning as the HTTP CORS allow-list in main.ts.
  cors: { origin: getAllowedOrigins(), credentials: true },
  namespace: '/chat',
  // Shorten heartbeat window so abrupt app/tab closes are reflected in presence quickly.
  pingInterval: 5000,
  pingTimeout: 7000,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  /**
   * Server-side typing cooldown: prevents a user from flooding the room with
   * `user_typing` events faster than once per 2 seconds per conversation.
   * Key: `${userId}:${conversationId}` → last emit timestamp (ms).
   */
  private typingCooldowns = new Map<string, number>();
  private readonly TYPING_COOLDOWN_MS = 2000;

  /**
   * A connected socket's presence entry in Redis has a TTL (see
   * ChatPresenceService.SOCKET_TTL_SECONDS) so it self-expires if a socket
   * disappears without a clean disconnect. Without periodically refreshing
   * it, every socket's presence would silently expire ~2 minutes after
   * connecting even while still fully connected — the online dot would then
   * flicker off client-side until the next reconnect. Keyed by socket.id so
   * handleDisconnect can clear the right interval.
   */
  private presenceHeartbeats = new Map<
    string,
    ReturnType<typeof setInterval>
  >();
  private readonly PRESENCE_HEARTBEAT_MS = 45000;

  constructor(
    private readonly jwtService: JwtService,
    private readonly chatService: ChatService,
    private readonly presenceService: ChatPresenceService,
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

  @OnEvent('chat.conversation.deleted')
  async handleConversationDeleted(event: { conversationId: string; userId: string }) {
    const socketIds = await this.presenceService.getUserSocketIds(event.userId);
    for (const socketId of socketIds) {
      this.server.to(socketId).emit('conversation_deleted', {
        conversationId: event.conversationId,
      });
    }
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

      // Track connected user in Redis-backed presence service
      await this.presenceService.setOnline(
        payload.sub,
        payload.tenantId,
        client.id,
      );

      // Keep the presence TTL alive for as long as this socket stays connected.
      const heartbeat = setInterval(() => {
        this.presenceService.refreshTtl(payload.sub).catch((error) => {
          this.logger.warn(
            `presence heartbeat failed for ${payload.sub}: ${error.message}`,
          );
        });
      }, this.PRESENCE_HEARTBEAT_MS);
      this.presenceHeartbeats.set(client.id, heartbeat);

      // Join tenant room
      client.join(`tenant:${payload.tenantId}`);

      // Send current tenant presence snapshot to newly connected socket.
      const onlineUserIds = await this.presenceService.getOnlineUsersInTenant(
        payload.tenantId,
      );
      this.server.to(client.id).emit('presence_snapshot', { onlineUserIds });

      // Broadcast that this user is online to tenant members.
      this.server.to(`tenant:${payload.tenantId}`).emit('user_presence', {
        userId: payload.sub,
        isOnline: true,
      });

      // Auto-join all user conversation rooms for real-time updates
      const conversationIds = await this.chatService.getUserConversationIds(
        payload.sub,
        payload.tenantId,
        payload.role,
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

  async handleDisconnect(client: AuthenticatedSocket) {
    const heartbeat = this.presenceHeartbeats.get(client.id);
    if (heartbeat) {
      clearInterval(heartbeat);
      this.presenceHeartbeats.delete(client.id);
    }

    if (client.user) {
      const stillOnline = await this.presenceService.setOffline(
        client.user.sub,
        client.id,
      );

      // Only broadcast offline if this was the user's last socket
      if (!stillOnline && client.user.tenantId) {
        this.server.to(`tenant:${client.user.tenantId}`).emit('user_presence', {
          userId: client.user.sub,
          isOnline: false,
        });
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
    client.join(`active-conversation:${data.conversationId}`);
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
    client.leave(`active-conversation:${data.conversationId}`);
    return { event: 'left', data: { conversationId: data.conversationId } };
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      conversationId: string;
      content: string;
      type?: string;
      attachment?: {
        fileUrl: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        thumbnailUrl?: string;
        duration?: number;
      };
      replyToId?: string;
    },
  ) {
    try {
      const message = await this.chatService.sendMessage(
        data.conversationId,
        client.user.sub,
        data.content,
        data.type || 'TEXT',
        data.attachment,
        data.replyToId,
      );

      const room = `conversation:${data.conversationId}`;

      // ── FIX #11: Single broadcast strategy ──────────────────────────
      // Step 1: Broadcast new_message to ALL sockets in the room (including sender).
      //         This covers everyone currently viewing the conversation.
      this.server.to(room).emit('new_message', message);

      // Step 2: Emit conversation_updated to connected participants and queue
      // a push unless one of their sockets is actively viewing this thread.
      // Every connected socket is auto-joined to its conversation rooms so it
      // can receive global badge updates; using that membership to suppress
      // push would incorrectly treat an open dashboard as an open chat.
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          data.conversationId,
          client.user.sub,
        );

      for (const participantId of participantIds) {
        const participantSocketIds =
          await this.presenceService.getUserSocketIds(participantId);

        let isActivelyViewingConversation = false;
        const activeRoom = `active-conversation:${data.conversationId}`;

        for (const socketId of participantSocketIds) {
          const socket = (this.server.sockets as any).get(socketId);
          if (socket?.rooms.has(activeRoom)) {
            isActivelyViewingConversation = true;
          }

          // Always send conversation_updated (for inbox list refresh).
          // new_message already delivered via room broadcast above.
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
        }

        // Push immediately unless the participant is looking at this thread.
        if (!isActivelyViewingConversation) {
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
              this.logger.warn(
                `Push enqueue for ${participantId} failed: ${err.message}`,
              ),
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
  handleTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    // ── FIX #10: Server-side cooldown + room-only broadcast ─────────
    const cooldownKey = `${client.user.sub}:${data.conversationId}`;
    const now = Date.now();
    const lastEmit = this.typingCooldowns.get(cooldownKey) ?? 0;

    if (now - lastEmit < this.TYPING_COOLDOWN_MS) {
      // Silently drop — client is sending too fast
      return;
    }

    this.typingCooldowns.set(cooldownKey, now);

    // Single room broadcast — no per-socket participant loop
    const room = `conversation:${data.conversationId}`;
    client.to(room).emit('user_typing', {
      conversationId: data.conversationId,
      userId: client.user.sub,
    });
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

    // Broadcast to conversation room — all participants in the view get updated
    const room = `conversation:${data.conversationId}`;
    this.server.to(room).emit('messages_read', eventData);

    // Also notify any participant sockets NOT in the room (inbox view)
    try {
      const participantIds =
        await this.chatService.getConversationParticipantIds(
          data.conversationId,
          client.user.sub,
        );

      for (const participantId of participantIds) {
        const participantSocketIds =
          await this.presenceService.getUserSocketIds(participantId);

        for (const socketId of participantSocketIds) {
          const socket = (this.server.sockets as any).get(socketId);
          if (!socket?.rooms.has(room)) {
            // Only emit to sockets NOT in the room (room already received it above)
            this.server.to(socketId).emit('messages_read', eventData);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast read receipt: ${error.message}`);
    }
  }

  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: {
      conversationId: string;
      messageId: string;
      scope?: 'SELF' | 'EVERYONE';
    },
  ) {
    try {
      await this.chatService.deleteMessage(
        data.messageId,
        client.user.sub,
        data.scope || 'EVERYONE',
      );

      const room = `conversation:${data.conversationId}`;
      this.server.to(room).emit('message_deleted', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        scope: data.scope || 'EVERYONE',
        deletedBy: client.user.sub,
      });

      return { event: 'message_deleted', data: { messageId: data.messageId } };
    } catch (error) {
      this.logger.error(`delete_message error: ${error.message}`);
      return { event: 'error', data: { message: error.message } };
    }
  }

  @SubscribeMessage('edit_message')
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody()
    data: { conversationId: string; messageId: string; content: string },
  ) {
    try {
      const updated = await this.chatService.editMessage(
        data.messageId,
        client.user.sub,
        data.content,
      );

      const room = `conversation:${data.conversationId}`;
      this.server.to(room).emit('message_edited', {
        conversationId: data.conversationId,
        messageId: data.messageId,
        content: updated.content,
        editedAt: updated.editedAt,
      });

      return { event: 'message_edited', data: updated };
    } catch (error) {
      this.logger.error(`edit_message error: ${error.message}`);
      return { event: 'error', data: { message: error.message } };
    }
  }

  /**
   * Check if a user is currently connected via WebSocket (Redis-backed).
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.presenceService.isUserOnline(userId);
  }
}
