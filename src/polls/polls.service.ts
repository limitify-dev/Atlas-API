import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PollStatus, Role } from '../../prisma/generated/client';
import { CreatePollDto, PollFiltersDto } from './dto';

@Injectable()
export class PollsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Audiences a given role is allowed to see (plus the universal "ALL"). */
  private audiencesForRole(role: Role): string[] {
    switch (role) {
      case Role.PARENT:
        return ['ALL', 'PARENTS'];
      case Role.TEACHER:
        return ['ALL', 'TEACHERS', 'STAFF'];
      case Role.STAFF:
        return ['ALL', 'STAFF'];
      default:
        return ['ALL', 'PARENTS', 'TEACHERS', 'STAFF'];
    }
  }

  async create(tenantId: string, userId: string, dto: CreatePollDto) {
    const labels = dto.options.map((o) => o.trim()).filter(Boolean);
    if (labels.length < 2) {
      throw new BadRequestException('A poll needs at least two options');
    }
    return this.prisma.poll.create({
      data: {
        tenantId,
        question: dto.question.trim(),
        audience: dto.audience || 'ALL',
        allowMultiple: dto.allowMultiple ?? false,
        publishedBy: userId,
        status: dto.status === 'DRAFT' ? PollStatus.DRAFT : PollStatus.ACTIVE,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        options: {
          create: labels.map((label, i) => ({ label, order: i })),
        },
      },
      include: { options: { orderBy: { order: 'asc' } } },
    });
  }

  /** Admin view — every poll for the tenant, with tallies. */
  async findAllAdmin(tenantId: string, filters: PollFiltersDto) {
    const polls = await this.prisma.poll.findMany({
      where: {
        tenantId,
        ...(filters.status ? { status: filters.status as PollStatus } : {}),
        ...(filters.audience ? { audience: filters.audience } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        options: { orderBy: { order: 'asc' } },
        _count: { select: { votes: true } },
      },
    });
    return Promise.all(polls.map((p) => this.decorateWithTallies(p)));
  }

  /** Audience view — active polls the user may vote on, with their votes. */
  async findForUser(tenantId: string, userId: string, role: Role) {
    const polls = await this.prisma.poll.findMany({
      where: {
        tenantId,
        status: PollStatus.ACTIVE,
        audience: { in: this.audiencesForRole(role) },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { publishedAt: 'desc' },
      include: { options: { orderBy: { order: 'asc' } } },
    });

    return Promise.all(
      polls.map(async (poll) => {
        const decorated = await this.decorateWithTallies(poll);
        const myVotes = await this.prisma.pollVote.findMany({
          where: { pollId: poll.id, userId },
          select: { optionId: true },
        });
        return {
          ...decorated,
          myOptionIds: myVotes.map((v) => v.optionId),
          hasVoted: myVotes.length > 0,
        };
      }),
    );
  }

  async getResults(tenantId: string, pollId: string) {
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, tenantId },
      include: { options: { orderBy: { order: 'asc' } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    return this.decorateWithTallies(poll);
  }

  /** Record a vote. Single-choice polls replace any prior vote by this user. */
  async vote(
    tenantId: string,
    userId: string,
    pollId: string,
    optionIds: string[],
  ) {
    const poll = await this.prisma.poll.findFirst({
      where: { id: pollId, tenantId },
      include: { options: { select: { id: true } } },
    });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.status !== PollStatus.ACTIVE) {
      throw new ForbiddenException('This poll is closed');
    }
    if (poll.expiresAt && poll.expiresAt < new Date()) {
      throw new ForbiddenException('This poll has expired');
    }

    const validIds = new Set(poll.options.map((o) => o.id));
    const chosen = optionIds.filter((id) => validIds.has(id));
    if (chosen.length === 0) {
      throw new BadRequestException('No valid option selected');
    }
    const selected = poll.allowMultiple ? chosen : [chosen[0]];

    await this.prisma.$transaction(async (tx) => {
      // Replace prior votes so a user can change their answer.
      await tx.pollVote.deleteMany({ where: { pollId, userId } });
      await tx.pollVote.createMany({
        data: selected.map((optionId) => ({ pollId, optionId, userId })),
      });
    });

    return this.getResults(tenantId, pollId);
  }

  async close(tenantId: string, id: string) {
    const poll = await this.prisma.poll.findFirst({ where: { id, tenantId } });
    if (!poll) throw new NotFoundException('Poll not found');
    return this.prisma.poll.update({
      where: { id },
      data: { status: PollStatus.CLOSED },
    });
  }

  async remove(tenantId: string, id: string) {
    const poll = await this.prisma.poll.findFirst({ where: { id, tenantId } });
    if (!poll) throw new NotFoundException('Poll not found');
    await this.prisma.poll.delete({ where: { id } });
    return { deleted: true };
  }

  /** Attach per-option and total vote counts to a poll with options loaded. */
  private async decorateWithTallies<
    T extends { id: string; options: { id: string }[] },
  >(poll: T) {
    const grouped = await this.prisma.pollVote.groupBy({
      by: ['optionId'],
      where: { pollId: poll.id },
      _count: { optionId: true },
    });
    const counts = new Map(
      grouped.map((g) => [g.optionId, g._count.optionId]),
    );
    const options = poll.options.map((o) => ({
      ...o,
      votes: counts.get(o.id) ?? 0,
    }));
    const totalVotes = options.reduce((sum, o) => sum + o.votes, 0);
    return { ...poll, options, totalVotes };
  }
}
