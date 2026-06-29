import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminApprovalStatus, Status } from '../../../prisma/generated/client';
import { ReviewApprovalDto } from '../dto';

@Injectable()
export class AdminApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(status?: AdminApprovalStatus) {
    return this.prisma.adminApproval.findMany({
      where: status ? { status } : undefined,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            status: true,
            createdAt: true,
          },
        },
        tenant: { select: { id: true, name: true, slug: true } },
        reviewer: { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const approval = await this.prisma.adminApproval.findUnique({
      where: { id },
      include: {
        user: true,
        tenant: { select: { id: true, name: true, slug: true } },
        reviewer: { select: { id: true, name: true } },
      },
    });
    if (!approval) throw new NotFoundException('Approval not found.');
    return approval;
  }

  /** Create a pending approval for a newly-registered admin user */
  async createForUser(tenantId: string, userId: string) {
    const existing = await this.prisma.adminApproval.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return this.prisma.adminApproval.create({
      data: { tenantId, userId },
    });
  }

  async review(id: string, reviewerId: string, dto: ReviewApprovalDto) {
    const approval = await this.findOne(id);

    if (approval.status !== AdminApprovalStatus.PENDING) {
      throw new BadRequestException('Only PENDING approvals can be reviewed.');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.adminApproval.update({
        where: { id },
        data: {
          status: dto.status,
          reviewedBy: reviewerId,
          reviewedAt: new Date(),
          notes: dto.notes,
        },
      }),
      // Activate or deactivate the user accordingly
      this.prisma.user.update({
        where: { id: approval.userId },
        data: {
          status:
            dto.status === AdminApprovalStatus.APPROVED
              ? Status.ACTIVE
              : Status.INACTIVE,
        },
      }),
    ]);

    return updated;
  }
}
