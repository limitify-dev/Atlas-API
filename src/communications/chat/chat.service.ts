import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateChannelDto, CreateGroupDto, UpdateGroupDto } from './dto';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  private hasTenantAccess(tenantId?: string | null): tenantId is string {
    return Boolean(tenantId && tenantId.trim().length > 0);
  }

  private async getTenantLogo(tenantId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logo: true },
    });
    return tenant?.logo || null;
  }

  /**
   * Get or create a 1-on-1 conversation between two users.
   * Returns existing conversation if one already exists.
   */
  async getOrCreateConversation(
    tenantId: string,
    userId: string,
    participantId: string,
  ) {
    if (userId === participantId) {
      throw new BadRequestException(
        'Cannot create a conversation with yourself',
      );
    }

    // Verify both users belong to the same tenant
    const participant = await this.prisma.user.findFirst({
      where: { id: participantId, tenantId, status: 'ACTIVE' },
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
   * Get paginated list of conversations for a user
   */
  async getUserConversations(
    userId: string,
    tenantId?: string | null,
    page: number = 1,
    limit: number = 20,
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

    const [conversations, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          tenantId,
          participants: { some: { userId } },
          status: 'ACTIVE',
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
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      this.prisma.conversation.count({
        where: {
          tenantId,
          participants: { some: { userId } },
          status: 'ACTIVE',
        },
      }),
    ]);

    const formatted = await Promise.all(
      conversations.map((conv) => this.formatConversation(conv, userId)),
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

  /**
   * Get messages in a conversation with cursor-based pagination
   */
  async getConversationMessages(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 50,
  ) {
    // Verify user is a participant and get other participant's read status
    const participants = await this.prisma.conversationParticipant.findMany({
      where: { conversationId },
      select: { userId: true, lastReadAt: true },
    });

    const participant = participants.find((p) => p.userId === userId);

    if (!participant) {
      throw new ForbiddenException(
        'You are not a participant of this conversation',
      );
    }

    const otherParticipant = participants.find((p) => p.userId !== userId);

    const messages = await this.prisma.chatMessage.findMany({
      where: { conversationId },
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
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
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

  /**
   * Get total unread message count across all conversations
   */
  async getUnreadCount(userId: string, tenantId: string) {
    if (!this.hasTenantAccess(tenantId)) {
      return { unreadCount: 0 };
    }

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { is: { tenantId, status: 'ACTIVE' } },
      },
      select: {
        conversationId: true,
        lastReadAt: true,
      },
    });

    let totalUnread = 0;

    for (const p of participants) {
      const count = await this.prisma.chatMessage.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt && { createdAt: { gt: p.lastReadAt } }),
          ...(!p.lastReadAt && {}), // All messages are unread if never read
        },
      });
      totalUnread += count;
    }

    return { unreadCount: totalUnread };
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

    return contacts;
  }

  /**
   * Parents can message: teachers of their children + admin/DOS/DM staff
   */
  private async getParentContacts(
    userId: string,
    tenantId: string,
  ): Promise<string[]> {
    // Parents can only message DM and DOS for now
    const staffUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        role: { in: ['STAFF'] },
        status: { in: ['ACTIVE', 'PENDING'] },
      },
      select: { id: true },
    });

    return staffUsers.map((u) => u.id);
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
          in: ['ADMIN', 'STAFF', 'TEACHER', 'SUPER_ADMIN'],
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
  async createGroup(tenantId: string, creatorId: string, dto: CreateGroupDto) {
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
      select: { id: true },
    });
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
   * Create a group for a school section (class) with parents and teachers
   */
  async createSectionGroup(
    tenantId: string,
    sectionId: string,
    creatorId: string,
  ) {
    const tenantLogo = await this.getTenantLogo(tenantId);

    // Find the section with grade info
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: {
        grade: true,
      },
    });

    if (!section) {
      throw new NotFoundException('Section not found');
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

    // Find class teachers for this section
    const classTeachers = await this.prisma.classTeacher.findMany({
      where: { sectionId },
      include: {
        teacher: {
          select: { userId: true },
        },
      },
    });

    const adminUserIds = new Set<string>();
    adminUserIds.add(creatorId);
    for (const ct of classTeachers) {
      if (ct.teacher.userId) {
        adminUserIds.add(ct.teacher.userId);
      }
    }

    const groupName = `${section.name} Parents`;

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
        select: { id: true },
      });

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
  ): Promise<string[]> {
    if (!this.hasTenantAccess(tenantId)) {
      return [];
    }

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        userId,
        conversation: { is: { tenantId, status: 'ACTIVE' } },
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
  private async formatConversation(conversation: any, userId: string) {
    const myParticipant = conversation.participants.find(
      (p: any) => p.userId === userId,
    );

    const lastMessage = conversation.messages?.[0] || null;

    // Count unread messages
    let unreadCount = 0;
    if (myParticipant) {
      unreadCount = await this.prisma.chatMessage.count({
        where: {
          conversationId: conversation.id,
          senderId: { not: userId },
          ...(myParticipant.lastReadAt && {
            createdAt: { gt: myParticipant.lastReadAt },
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
    };

    if (conversation.type === 'GROUP' || conversation.type === 'CHANNEL') {
      return {
        ...base,
        name: conversation.name,
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
      participant: otherParticipant?.user || null,
    };
  }
}
