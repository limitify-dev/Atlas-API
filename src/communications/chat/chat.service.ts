import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { CreateChannelDto, CreateGroupDto, UpdateGroupDto } from './dto';
import {
  PARENT_MESSAGING_STAFF_ROLES,
  resolveContactDisplayRole,
} from '../../common/constants/staff-roles';
import {
  Role,
  Prisma,
  ConversationType,
} from '../../../prisma/generated/client';
import { EventEmitter2 } from '@nestjs/event-emitter';

const CHAT_ATTACHMENT_BUCKET = 'atlas-chat';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Best-effort removal of a chat attachment's underlying file from storage.
   * Never throws — a storage cleanup failure shouldn't block message deletion,
   * since the message is already gone from the chat either way.
   */
  private async deleteAttachmentFile(fileUrl?: string | null): Promise<void> {
    if (!fileUrl) return;
    const marker = `/${CHAT_ATTACHMENT_BUCKET}/`;
    const markerIndex = fileUrl.indexOf(marker);
    if (markerIndex === -1) return;

    const storagePath = decodeURIComponent(
      fileUrl.slice(markerIndex + marker.length),
    );
    const { error } = await this.supabase.client.storage
      .from(CHAT_ATTACHMENT_BUCKET)
      .remove([storagePath]);

    if (error) {
      this.logger.warn(
        `Failed to remove chat attachment "${storagePath}": ${error.message}`,
      );
    }
  }

  private hasTenantAccess(tenantId?: string | null): tenantId is string {
    return Boolean(tenantId && tenantId.trim().length > 0);
  }

  private readonly contactUserSelect = {
    id: true,
    name: true,
    avatar: true,
    role: true,
    userType: true,
    staff: {
      select: {
        staffRole: true,
        department: true,
      },
    },
    parent: {
      select: {
        relationship: true,
        children: {
          select: {
            student: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
    },
  } as const;

  private formatContactUser(user: any) {
    if (!user) return null;
    return {
      ...user,
      displayRole: resolveContactDisplayRole(user),
    };
  }

  private async getTenantLogo(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logo: true },
    });
    return tenant?.logo || null;
  }

  /**
   * Parent communication is admin/staff-only — a teacher may never message a
   * parent directly or belong to a group that includes one. Throws if
   * `actorRole` is TEACHER and any of `participantRoles` is PARENT.
   */
  private assertTeacherNotMessagingParents(
    actorRole: string | undefined,
    participantRoles: (string | null | undefined)[],
  ): void {
    if (actorRole !== 'TEACHER') return;
    if (participantRoles.includes('PARENT')) {
      throw new ForbiddenException(
        'Teachers cannot message parents directly or belong to parent groups. Please contact an admin or staff member.',
      );
    }
  }

  /** Whether any participant of this conversation is a PARENT. */
  private async conversationHasParentParticipant(
    conversationId: string,
  ): Promise<boolean> {
    const parentParticipant =
      await this.prisma.conversationParticipant.findFirst({
        where: { conversationId, user: { role: Role.PARENT } },
        select: { id: true },
      });
    return !!parentParticipant;
  }

  /**
   * Defense-in-depth for conversations a teacher may already be part of
   * (e.g. created before this restriction existed) — blocks viewing or
   * sending into any conversation that includes a parent.
   */
  private async assertTeacherNotAccessingParentConversation(
    conversationId: string,
    actorRole: string | undefined,
  ): Promise<void> {
    if (actorRole !== 'TEACHER') return;
    if (await this.conversationHasParentParticipant(conversationId)) {
      throw new ForbiddenException(
        'Teachers cannot access conversations that include parents.',
      );
    }
  }

  /**
   * Get or create a 1-on-1 conversation between two users.
   * Returns existing conversation if one already exists.
   */
  async getOrCreateConversation(
    tenantId: string,
    userId: string,
    participantId: string,
    actorRole?: string,
  ) {
    if (userId === participantId) {
      throw new BadRequestException(
        'Cannot create a conversation with yourself',
      );
    }

    // Verify both users belong to the same tenant
    const participant = await this.prisma.user.findFirst({
      where: {
        id: participantId,
        tenantId,
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        role: true,
        userType: true,
        parent: {
          select: {
            relationship: true,
            children: {
              select: {
                student: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    // Applies whether or not a conversation with this parent already exists
    // — teachers can't resume talking to a parent either.
    this.assertTeacherNotMessagingParents(actorRole, [participant.role]);

    // Check if conversation already exists between these two users
    const existing = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        type: 'DIRECT',
        AND: [
          { participants: { some: { userId } } },
          { participants: { some: { userId: participantId } } },
        ],
        // Ensure it's a 1-on-1 (exactly 2 participants)
        participants: { every: { userId: { in: [userId, participantId] } } },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (existing) {
      await this.prisma.conversationParticipant.update({
        where: {
          conversationId_userId: {
            conversationId: existing.id,
            userId,
          },
        },
        data: { isHidden: false },
      });
      return this.formatConversation(existing, userId);
    }

    // Validate contact rules before creating
    await this.validateContactPermission(tenantId, userId, participantId);

    // Create new conversation
    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        type: 'DIRECT',
        participants: {
          create: [{ userId }, { userId: participantId }],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return this.formatConversation(conversation, userId);
  }

  /**
   * Sections a teacher actually teaches — either as the subject teacher for
   * some scheduled period (TimetableEntry) or as the section's homeroom
   * teacher (ClassTeacher). Used to scope which class/section GROUP
   * conversations a teacher may see. Recomputed fresh on every call (not
   * cached), so it self-corrects the moment a teaching assignment changes —
   * no sync job needed to keep group visibility in step with the timetable.
   */
  private async getTeacherSectionIds(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const teacher = await this.prisma.teacher.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
    if (!teacher) return [];

    const [timetableRows, classTeacherRows] = await Promise.all([
      this.prisma.timetableEntry.findMany({
        where: { tenantId, teacherId: teacher.id },
        select: { sectionId: true },
        distinct: ['sectionId'],
      }),
      this.prisma.classTeacher.findMany({
        where: { teacherId: teacher.id },
        select: { sectionId: true },
      }),
    ]);

    return Array.from(
      new Set([
        ...timetableRows.map((r) => r.sectionId),
        ...classTeacherRows.map((r) => r.sectionId),
      ]),
    );
  }

  /**
   * Restricts GROUP conversations to ones whose section is in `sectionIds`.
   * DIRECT/CHANNEL conversations and section-less (ad-hoc) GROUPs pass
   * through untouched — this only closes the "teacher sees a class group for
   * a section they don't teach" gap, not general manual group membership.
   */
  private teacherGroupScopeFilter(
    sectionIds: string[],
  ): Prisma.ConversationWhereInput {
    return {
      OR: [
        { type: { not: ConversationType.GROUP } },
        { sectionId: null },
        { sectionId: { in: sectionIds } },
      ],
    };
  }

  /**
   * Get paginated list of conversations for a user
   */
  async getUserConversations(
    userId: string,
    tenantId?: string | null,
    page: number = 1,
    limit: number = 20,
    actorRole?: string,
  ) {
    if (!this.hasTenantAccess(tenantId)) {
      return {
        data: [],
        meta: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    const skip = (page - 1) * limit;

    // Teachers shouldn't see parent conversations in their inbox at all —
    // even ones they were somehow already added to.
    const excludeParentGroups =
      actorRole === 'TEACHER'
        ? { NOT: { participants: { some: { user: { role: Role.PARENT } } } } }
        : {};

    // And class/section GROUPs are scoped to sections they actually teach.
    const teacherGroupScope =
      actorRole === 'TEACHER'
        ? this.teacherGroupScopeFilter(
            await this.getTeacherSectionIds(userId, tenantId),
          )
        : {};

    const where: Prisma.ConversationWhereInput = {
      tenantId,
      participants: { some: { userId, isHidden: false } },
      status: 'ACTIVE',
      ...excludeParentGroups,
      ...teacherGroupScope,
    };

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          participants: {
            include: {
              user: {
                select: this.contactUserSelect,
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: { id: true, name: true },
              },
            },
          },
          section: {
            include: { grade: true },
          },
        },
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    const conversationIds = conversations.map((c) => c.id);
    const unreadCounts = await this.batchGetUnreadCounts(
      userId,
      conversationIds,
    );

    const formatted = await Promise.all(
      conversations.map((conv) =>
        this.formatConversation(conv, userId, unreadCounts.get(conv.id)),
      ),
    );

    return {
      data: formatted,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get a single conversation by id for the current user.
   */
  async getConversationById(
    conversationId: string,
    userId: string,
    tenantId?: string | null,
    actorRole?: string,
  ) {
    if (!this.hasTenantAccess(tenantId)) {
      throw new NotFoundException('Conversation not found');
    }

    const teacherGroupScope =
      actorRole === 'TEACHER'
        ? this.teacherGroupScopeFilter(
            await this.getTeacherSectionIds(userId, tenantId),
          )
        : {};

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
        status: 'ACTIVE',
        participants: { some: { userId } },
        ...(actorRole === 'TEACHER'
          ? { NOT: { participants: { some: { user: { role: Role.PARENT } } } } }
          : {}),
        ...teacherGroupScope,
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    return this.formatConversation(conversation, userId);
  }

  /** Clears a chat only for the requesting participant. */
  async deleteConversation(
    conversationId: string,
    userId: string,
    tenantId?: string | null,
    _actorRole?: string,
  ) {
    if (!this.hasTenantAccess(tenantId)) {
      throw new NotFoundException('Conversation not found');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        tenantId,
        status: 'ACTIVE',
        participants: { some: { userId } },
      },
      select: { id: true },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    const clearedAt = new Date();
    await this.prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { clearedAt, isHidden: true, lastReadAt: clearedAt },
    });

    this.eventEmitter.emit('chat.conversation.deleted', {
      conversationId,
      userId,
    });

    return { success: true, conversationId, clearedAt };
  }

  /**
   * Get messages in a conversation with cursor-based pagination
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 50,
    actorRole?: string,
  ) {
    // Verify user is a participant and get other participant's read status
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: {
        userId: true,
        lastReadAt: true,
        clearedAt: true,
        user: { select: { role: true } },
      },
    });

    const participant = participants.find((p) => p.userId === userId);

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    this.assertTeacherNotMessagingParents(
      actorRole,
      participants.map((p) => p.user.role),
    );

    const otherParticipant = participants.find((p) => p.userId !== userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(participant.clearedAt && { createdAt: { gt: participant.clearedAt } }),
      },
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1, // Skip the cursor itself
      }),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: {
          select: { id: true, name: true, avatar: true },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            type: true,
            sender: { select: { id: true, name: true } },
          },
        },
      },
    });

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id : null;

    const messagesWithStatus = messages.map((msg) => ({
      ...msg,
      isRead: otherParticipant?.lastReadAt
        ? msg.createdAt <= otherParticipant.lastReadAt
        : false,
    }));

    return {
      data: messagesWithStatus.reverse(), // Return in chronological order
      meta: {
        hasMore,
        nextCursor,
      },
    };
  }

  /**
   * Send a message in a conversation
   */
  async sendMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: string = 'TEXT',
    attachment?: any,
    replyToId?: string,
  ) {
    // Verify sender is a participant
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId: senderId },
      },
      include: {
        conversation: { select: { isReadOnly: true, type: true } },
        user: { select: { role: true } },
      },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    await this.assertTeacherNotAccessingParentConversation(
      conversationId,
      participant.user.role,
    );

    // Channels are always admin-only for posting. Keep isReadOnly as additional guard.
    const isChannel = participant.conversation.type === 'CHANNEL';
    if (
      (isChannel || participant.conversation.isReadOnly) &&
      participant.user.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('This channel is read-only');
    }

    // Create message and update conversation timestamp in a transaction
    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: {
          conversationId,
          senderId,
          content,
          type: type as any,
          metadata: attachment ? (attachment as any) : undefined,
          replyToId,
        },
        include: {
          sender: {
            select: { id: true, name: true, avatar: true, role: true },
          },
          conversation: {
            select: {
              id: true,
              type: true,
              name: true,
              avatar: true,
              isReadOnly: true,
            },
          },
          replyTo: {
            select: {
              id: true,
              content: true,
              type: true,
              sender: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
      this.prisma.conversationParticipant.updateMany({
        where: { conversationId, isHidden: true },
        data: { isHidden: false },
      }),
    ]);

    return message;
  }

  /**
   * Mark all messages in a conversation as read for a user
   */
  async markAsRead(conversationId: string, userId: string) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    await this.prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() },
    });

    return { success: true };
  }

  // ─── Message Lifecycle (Edit, Delete, Search, Threading, Media) ───

  async deleteMessage(
    messageId: string,
    userId: string,
    scope: 'SELF' | 'EVERYONE',
  ) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: { include: { participants: { where: { userId } } } },
      },
    });

    if (!message) throw new NotFoundException('Message not found');

    const participant = message.conversation.participants[0];
    if (!participant) throw new ForbiddenException('Not a participant');

    if (
      scope === 'EVERYONE' &&
      message.senderId !== userId &&
      participant.role !== 'ADMIN'
    ) {
      throw new ForbiddenException('Cannot delete this message for everyone');
    }

    await this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    const metadata = message.metadata as { fileUrl?: string } | null;
    await this.deleteAttachmentFile(metadata?.fileUrl);

    return { success: true };
  }

  async editMessage(messageId: string, userId: string, content: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== userId)
      throw new ForbiddenException('Cannot edit others messages');
    if (message.deletedAt)
      throw new BadRequestException('Cannot edit a deleted message');

    return this.prisma.chatMessage.update({
      where: { id: messageId },
      data: { content, editedAt: new Date() },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async getMessageReplies(messageId: string, userId: string) {
    const message = await this.prisma.chatMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: { include: { participants: { where: { userId } } } },
      },
    });

    if (!message) throw new NotFoundException('Message not found');
    if (message.conversation.participants.length === 0)
      throw new ForbiddenException('Not a participant');

    return this.prisma.chatMessage.findMany({
      where: { replyToId: messageId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      include: { sender: { select: { id: true, name: true, avatar: true } } },
    });
  }

  async searchMessages(
    userId: string,
    tenantId: string,
    query: string,
    conversationId?: string,
  ) {
    // Note: In a real system, you'd want to use full-text search features of Prisma/Postgres
    // For simplicity in Prisma without raw queries on JSON fields, we use contains

    if (!query || query.length < 2) return [];

    const memberships = await this.prisma.conversationParticipant.findMany({
      where: { userId, conversation: { is: { tenantId } } },
      select: { conversationId: true, clearedAt: true },
    });
    const clearedAtByConversation = new Map(
      memberships.map((membership) => [membership.conversationId, membership.clearedAt]),
    );

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        content: { contains: query, mode: 'insensitive' },
        deletedAt: null,
        conversation: {
          tenantId,
          participants: { some: { userId } },
          ...(conversationId ? { id: conversationId } : {}),
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        conversation: { select: { id: true, type: true, name: true } },
      },
    });

    return messages
      .filter((message) => {
        const clearedAt = clearedAtByConversation.get(message.conversationId);
        return !clearedAt || message.createdAt > clearedAt;
      })
      .slice(0, 20);
  }

  async getConversationMedia(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 20,
  ) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });

    if (!participant) throw new ForbiddenException('Not a participant');

    const messages = await this.prisma.chatMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(participant.clearedAt && { createdAt: { gt: participant.clearedAt } }),
        type: { in: ['IMAGE', 'FILE', 'AUDIO', 'VIDEO'] },
      },
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { sender: { select: { id: true, name: true } } },
    });

    const hasMore = messages.length === limit;
    const nextCursor = hasMore ? messages[messages.length - 1].id : null;

    return { data: messages, meta: { hasMore, nextCursor } };
  }

  /**
   * Get total unread message count across all conversations
   */
  async getUnreadCount(userId: string, tenantId: string) {
    if (!this.hasTenantAccess(tenantId)) {
      return { unreadCount: 0 };
    }

    const result = await this.prisma.$queryRaw<{ unread: number }[]>`
      SELECT COUNT(m.id)::int AS unread
      FROM conversation_participants p
      JOIN conversations c ON c.id = p."conversationId"
      LEFT JOIN chat_messages m
        ON m."conversationId" = p."conversationId"
        AND m."senderId" != p."userId"
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
        AND (p."clearedAt" IS NULL OR m."createdAt" > p."clearedAt")
        AND m."deletedAt" IS NULL
      WHERE p."userId" = ${userId}
        AND c."tenantId" = ${tenantId}
        AND c.status = 'ACTIVE'
    `;

    return { unreadCount: result[0]?.unread || 0 };
  }

  /**
   * Batch fetch unread message counts for multiple conversations to avoid N+1 queries.
   */
  private async batchGetUnreadCounts(
    userId: string,
    conversationIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (!conversationIds.length) return map;

    const results = await this.prisma.$queryRaw<
      { conversationId: string; unread: number }[]
    >`
      SELECT p."conversationId", COUNT(m.id)::int AS unread
      FROM conversation_participants p
      LEFT JOIN chat_messages m
        ON m."conversationId" = p."conversationId"
        AND m."senderId" != p."userId"
        AND (p."lastReadAt" IS NULL OR m."createdAt" > p."lastReadAt")
        AND (p."clearedAt" IS NULL OR m."createdAt" > p."clearedAt")
        AND m."deletedAt" IS NULL
      WHERE p."userId" = ${userId}
        AND p."conversationId" IN (${Prisma.join(conversationIds)})
      GROUP BY p."conversationId"
    `;

    for (const res of results) {
      map.set(res.conversationId, res.unread);
    }
    return map;
  }

  /**
   * Get the list of other participants in a conversation (for push notifications)
   */
  async getConversationParticipantIds(
    conversationId: string,
    excludeUserId: string,
  ): Promise<string[]> {
    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { not: excludeUserId },
      },
      select: { userId: true },
    });
    return participants.map((p) => p.userId);
  }

  /**
   * Get available contacts for a user based on role-based access rules
   */
  async getContacts(userId: string, tenantId: string) {
    if (!this.hasTenantAccess(tenantId)) {
      return [];
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, userType: true, tenantId: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    let contactUserIds: string[] = [];

    switch (user.role) {
      case 'PARENT':
        contactUserIds = await this.getParentContacts(userId, tenantId);
        break;
      case 'TEACHER':
        contactUserIds = await this.getTeacherContacts(userId, tenantId);
        break;
      case 'ADMIN':
      case 'STAFF':
      case 'SUPER_ADMIN':
        contactUserIds = await this.getAdminContacts(userId, tenantId);
        break;
      default:
        contactUserIds = [];
    }

    if (contactUserIds.length === 0) {
      return [];
    }

    const contacts = await this.prisma.user.findMany({
      where: {
        id: { in: contactUserIds },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        role: true,
        userType: true,
        staff: {
          select: {
            staffRole: true,
            department: true,
          },
        },
        parent: {
          select: {
            relationship: true,
            children: {
              select: {
                student: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return contacts.map((contact) => ({
      ...contact,
      displayRole: resolveContactDisplayRole(contact),
    }));
  }

  /**
   * Parents can message: school admin + academics (DOS), discipline (DM), and finance (Bursar) staff.
   */
  private async getParentContacts(
    _userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const [staffUsers, adminUsers] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: 'STAFF',
          status: { in: ['ACTIVE', 'PENDING'] },
          staff: {
            staffRole: {
              in: PARENT_MESSAGING_STAFF_ROLES,
              mode: 'insensitive',
            },
          },
        },
        select: { id: true },
      }),
      this.prisma.user.findMany({
        where: {
          tenantId,
          role: 'ADMIN',
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        select: { id: true },
      }),
    ]);

    return [...staffUsers, ...adminUsers].map((u) => u.id);
  }

  /**
   * Teachers can message: other teachers + admin/staff
   */
  private async getTeacherContacts(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    // Teachers can message other teachers + admin/staff in the same tenant
    const otherUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        id: { not: userId },
        role: { in: ['TEACHER', 'ADMIN', 'STAFF'] },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });

    return otherUsers.map((u) => u.id);
  }

  /**
   * Admin/DOS/DM can message all staff and parents in their tenant
   */
  private async getAdminContacts(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    const users = await this.prisma.user.findMany({
      where: {
        ...(tenantId && { tenantId }),
        id: { not: userId },
        role: {
          in: ['ADMIN', 'STAFF', 'TEACHER', 'SUPER_ADMIN', 'PARENT'],
        },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });

    return users.map((u) => u.id);
  }

  /**
   * Validate that two users are allowed to message each other
   */
  private async validateContactPermission(
    tenantId: string,
    userId: string,
    participantId: string,
  ) {
    const contacts = await this.getContacts(userId, tenantId);
    const isAllowed = contacts.some((c) => c.id === participantId);

    if (!isAllowed) {
      throw new ForbiddenException('You are not allowed to message this user');
    }
  }

  // ─── Group & Channel Methods ───────────────────────────────────────

  /**
   * Create a group conversation
   */
  async createGroup(
    tenantId: string,
    creatorId: string,
    dto: CreateGroupDto,
    actorRole?: string,
  ) {
    const tenantLogo = await this.getTenantLogo(tenantId);

    if (dto.sectionId) {
      const section = await this.prisma.section.findFirst({
        where: { id: dto.sectionId, tenantId },
        select: { id: true },
      });
      if (!section) {
        throw new NotFoundException('Section not found');
      }
    }

    const requestedParticipantIds = Array.from(
      new Set([creatorId, ...dto.participantIds]),
    );
    const validParticipants = await this.prisma.user.findMany({
      where: {
        tenantId,
        id: { in: requestedParticipantIds },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true, role: true },
    });
    this.assertTeacherNotMessagingParents(
      actorRole,
      validParticipants.filter((u) => u.id !== creatorId).map((u) => u.role),
    );
    const validIds = new Set(validParticipants.map((u) => u.id));
    if (!validIds.has(creatorId)) {
      throw new ForbiddenException('Creator is not part of this tenant');
    }

    const participantIds = requestedParticipantIds.filter((id) =>
      validIds.has(id),
    );

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        type: 'GROUP',
        name: dto.name,
        description: dto.description,
        avatar: tenantLogo,
        createdBy: creatorId,
        sectionId: dto.sectionId,
        participants: {
          create: [
            { userId: creatorId, role: 'ADMIN' },
            ...participantIds
              .filter((id) => id !== creatorId)
              .map((id) => ({ userId: id, role: 'MEMBER' as const })),
          ],
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return this.formatConversation(conversation, creatorId);
  }

  /**
   * Create a group for a school section (class) with all of its parents.
   * Admin/staff only — teachers are never participants of this group.
   */
  async createSectionGroup(
    tenantId: string,
    sectionId: string,
    creatorId: string,
    actorRole?: string,
  ) {
    if (actorRole === 'TEACHER') {
      throw new ForbiddenException(
        'Teachers cannot create parent groups. Please contact an admin or staff member.',
      );
    }

    const tenantLogo = await this.getTenantLogo(tenantId);

    // Find the section with grade info
    const section = await this.prisma.section.findFirst({
      where: { id: sectionId, tenantId },
      include: {
        grade: true,
      },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
    }

    // Return existing group if one already exists for this section
    const existing = await this.prisma.conversation.findFirst({
      where: { tenantId, sectionId, type: 'GROUP', status: 'ACTIVE' },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sender: { select: { id: true, name: true } } },
        },
        section: { include: { grade: true } },
      },
    });
    if (existing) {
      return this.formatConversation(existing, creatorId);
    }

    // Find all students in this section
    const students = await this.prisma.student.findMany({
      where: { tenantId, sectionId },
      include: {
        parents: {
          include: {
            parent: {
              select: { userId: true },
            },
          },
        },
      },
    });

    // Collect parent userIds
    const parentUserIds = new Set<string>();
    for (const student of students) {
      for (const pc of student.parents) {
        if (pc.parent.userId) {
          parentUserIds.add(pc.parent.userId);
        }
      }
    }

    // Note: class teachers are deliberately NOT added here — parent
    // communication is admin/staff-only, so teachers never become
    // participants of a section's parent group.
    const adminUserIds = new Set<string>([creatorId]);

    const groupName = `${section.grade.code}${section.name} Parents`;

    // Build participant create data
    const participantData = [
      ...Array.from(adminUserIds).map((uid) => ({
        userId: uid,
        role: 'ADMIN' as const,
      })),
      ...Array.from(parentUserIds)
        .filter((uid) => !adminUserIds.has(uid))
        .map((uid) => ({
          userId: uid,
          role: 'MEMBER' as const,
        })),
    ];

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        type: 'GROUP',
        name: groupName,
        avatar: tenantLogo,
        createdBy: creatorId,
        sectionId,
        participants: {
          create: participantData,
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
        section: { include: { grade: true } },
      },
    });

    return this.formatConversation(conversation, creatorId);
  }

  /**
   * Create a channel (broadcast-style, read-only for non-admins)
   */
  async createChannel(
    tenantId: string,
    creatorId: string,
    dto: CreateChannelDto,
  ) {
    const tenantLogo = await this.getTenantLogo(tenantId);

    // Find all STAFF/TEACHER users in tenant
    const staffTeacherUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['STAFF', 'TEACHER'] },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });

    // Only ADMIN users can post in channels.
    const adminUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: 'ADMIN',
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });

    const adminIds = new Set<string>(adminUsers.map((u) => u.id));
    adminIds.add(creatorId);

    const participantData = [
      ...Array.from(adminIds).map((uid) => ({
        userId: uid,
        role: 'ADMIN' as const,
      })),
      ...staffTeacherUsers
        .filter((u) => !adminIds.has(u.id))
        .map((u) => ({
          userId: u.id,
          role: 'MEMBER' as const,
        })),
    ];

    const conversation = await this.prisma.conversation.create({
      data: {
        tenantId,
        type: 'CHANNEL',
        name: dto.name,
        description: dto.description,
        avatar: tenantLogo,
        isReadOnly: true,
        createdBy: creatorId,
        participants: {
          create: participantData,
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return this.formatConversation(conversation, creatorId);
  }

  /**
   * Get or create the school announcements channel
   */
  async getSchoolChannel(tenantId: string) {
    let channel = await this.prisma.conversation.findFirst({
      where: {
        tenantId,
        type: 'CHANNEL',
        name: { contains: 'School' },
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!channel) {
      const [staffTeacherUsers, adminUsers] = await Promise.all([
        this.prisma.user.findMany({
          where: {
            tenantId,
            role: { in: ['STAFF', 'TEACHER'] },
            status: { in: ['ACTIVE', 'PENDING'] },
          },
          select: { id: true },
        }),
        this.prisma.user.findMany({
          where: {
            tenantId,
            role: 'ADMIN',
            status: { in: ['ACTIVE', 'PENDING'] },
          },
          select: { id: true },
        }),
      ]);

      const adminIds = new Set(adminUsers.map((u) => u.id));
      const participantData = [
        ...Array.from(adminIds).map((uid) => ({
          userId: uid,
          role: 'ADMIN' as const,
        })),
        ...staffTeacherUsers
          .filter((u) => !adminIds.has(u.id))
          .map((u) => ({
            userId: u.id,
            role: 'MEMBER' as const,
          })),
      ];

      channel = await this.prisma.conversation.create({
        data: {
          tenantId,
          type: 'CHANNEL',
          name: 'School Announcements',
          avatar: await this.getTenantLogo(tenantId),
          isReadOnly: true,
          participants: {
            create: participantData,
          },
        },
        include: {
          participants: {
            include: {
              user: {
                select: this.contactUserSelect,
              },
            },
          },
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              sender: {
                select: { id: true, name: true },
              },
            },
          },
        },
      });
    }

    return channel;
  }

  /**
   * Add participants to a group conversation
   */
  async addParticipants(
    conversationId: string,
    userId: string,
    participantIds: string[],
    actorRole?: string,
  ) {
    // Verify user is ADMIN participant
    const adminParticipant =
      await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        include: {
          conversation: { select: { type: true, tenantId: true } },
        },
      });

    if (!adminParticipant || adminParticipant.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only admins can add participants to this group',
      );
    }

    if (adminParticipant.conversation.type !== 'GROUP') {
      throw new BadRequestException(
        'Participants can only be added to group conversations',
      );
    }

    // Filter out users who are already participants
    const existingParticipants =
      await this.prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          userId: { in: participantIds },
        },
        select: { userId: true },
      });
    const existingIds = new Set(existingParticipants.map((p) => p.userId));
    const newIds = participantIds.filter((id) => !existingIds.has(id));

    if (newIds.length > 0) {
      const tenantScopedUsers = await this.prisma.user.findMany({
        where: {
          id: { in: newIds },
          tenantId: adminParticipant.conversation.tenantId,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        select: { id: true, role: true },
      });
      this.assertTeacherNotMessagingParents(
        actorRole,
        tenantScopedUsers.map((u) => u.role),
      );

      const validNewIds = tenantScopedUsers.map((u) => u.id);
      await this.prisma.conversationParticipant.createMany({
        data: validNewIds.map((id) => ({
          conversationId,
          userId: id,
          role: 'MEMBER' as const,
        })),
      });
    }

    // Return updated conversation
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return this.formatConversation(conversation, userId);
  }

  /**
   * Remove a participant from a group conversation
   */
  async removeParticipant(
    conversationId: string,
    userId: string,
    targetUserId: string,
  ) {
    // Verify user is ADMIN participant
    const adminParticipant =
      await this.prisma.conversationParticipant.findUnique({
        where: {
          conversationId_userId: { conversationId, userId },
        },
        include: {
          conversation: { select: { type: true } },
        },
      });

    if (!adminParticipant || adminParticipant.role !== 'ADMIN') {
      throw new ForbiddenException(
        'Only admins can remove participants from this group',
      );
    }
    if (adminParticipant.conversation.type !== 'GROUP') {
      throw new BadRequestException(
        'Participants can only be removed from group conversations',
      );
    }

    // Remove target participant
    await this.prisma.conversationParticipant.delete({
      where: {
        conversationId_userId: { conversationId, userId: targetUserId },
      },
    });

    return { success: true };
  }

  async updateGroup(groupId: string, userId: string, dto: UpdateGroupDto) {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: { conversationId: groupId, userId },
      },
      include: {
        conversation: { select: { type: true } },
      },
    });
    if (!participant || participant.role !== 'ADMIN') {
      throw new ForbiddenException('Only admins can update this group');
    }
    if (participant.conversation.type !== 'GROUP') {
      throw new BadRequestException('Only group conversations can be updated');
    }

    const conversation = await this.prisma.conversation.update({
      where: { id: groupId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
                role: true,
                userType: true,
                parent: {
                  select: {
                    relationship: true,
                    children: {
                      select: {
                        student: {
                          select: { firstName: true, lastName: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return this.formatConversation(conversation, userId);
  }

  /**
   * Get all conversation IDs a user belongs to (for WebSocket room auto-join)
   */
  async getUserConversationIds(
    userId: string,
    tenantId?: string | null,
    actorRole?: string,
  ): Promise<string[]> {
    if (!this.hasTenantAccess(tenantId)) {
      return [];
    }

    const teacherGroupScope =
      actorRole === 'TEACHER'
        ? this.teacherGroupScopeFilter(
            await this.getTeacherSectionIds(userId, tenantId),
          )
        : {};

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: {
          is: { tenantId, status: 'ACTIVE', ...teacherGroupScope },
        },
      },
      select: { conversationId: true },
    });

    return participants.map((p) => p.conversationId);
  }

  // ─── Private Helpers ───────────────────────────────────────────────

  /**
   * Format a conversation with unread count and participant info.
   * Handles DIRECT, GROUP, and CHANNEL types.
   */
  private async formatConversation(
    conversation: any,
    userId: string,
    precomputedUnreadCount?: number,
  ) {
    const myParticipant = conversation.participants.find(
      (p: any) => p.userId === userId,
    );

    const candidateLastMessage = conversation.messages?.[0] || null;
    const lastMessage =
      candidateLastMessage &&
      (!myParticipant?.clearedAt || candidateLastMessage.createdAt > myParticipant.clearedAt)
        ? candidateLastMessage
        : null;

    // Count unread messages
    let unreadCount = precomputedUnreadCount ?? 0;
    if (precomputedUnreadCount === undefined && myParticipant) {
      unreadCount = await this.prisma.chatMessage.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: userId },
          deletedAt: null,
          ...((myParticipant.lastReadAt || myParticipant.clearedAt) && {
            createdAt: {
              gt:
                !myParticipant.lastReadAt ||
                (myParticipant.clearedAt && myParticipant.clearedAt > myParticipant.lastReadAt)
                  ? myParticipant.clearedAt
                  : myParticipant.lastReadAt,
            },
          }),
        },
      });
    }

    const base = {
      id: conversation.id,
      type: conversation.type || 'DIRECT',
      status: conversation.status,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            type: lastMessage.type,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender.name,
            createdAt: lastMessage.createdAt,
          }
        : null,
      unreadCount,
      isMuted: myParticipant?.isMuted || false,
      canDelete: true,
    };

    if (conversation.type === 'GROUP' || conversation.type === 'CHANNEL') {
      let displayName = conversation.name as string;
      // Recompute section group names so they always reflect the correct grade code,
      // regardless of what was stored in the DB.
      if (conversation.sectionId) {
        const section =
          conversation.section ??
          (await this.prisma.section.findUnique({
            where: { id: conversation.sectionId },
            include: { grade: true },
          }));
        if (section?.grade) {
          displayName = `${section.grade.code}${section.name} Parents`;
        }
      }
      return {
        ...base,
        name: displayName,
        description: conversation.description,
        avatar: conversation.avatar,
        isReadOnly: conversation.isReadOnly || false,
        sectionId: conversation.sectionId,
        memberCount: conversation.participants.length,
        members: conversation.participants.map((p: any) => ({
          ...p.user,
          role:
            conversation.type === 'CHANNEL'
              ? p.user.role === 'ADMIN'
                ? 'ADMIN'
                : 'MEMBER'
              : p.role,
        })),
      };
    }

    // DIRECT conversation
    const otherParticipant = conversation.participants.find(
      (p: any) => p.userId !== userId,
    );

    return {
      ...base,
      participant: this.formatContactUser(otherParticipant?.user || null),
    };
  }
}
