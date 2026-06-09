import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAdminInviteDto } from '../dto';

@Injectable()
export class AdminProvisionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a single-use admin invite for a tenant.
   * The invite token is used by the admin to complete onboarding via the main Auth API.
   */
  async createInvite(tenantId: string, dto: CreateAdminInviteDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    if (!dto.email && !dto.phone) {
      throw new BadRequestException('Either email or phone is required for the invite.');
    }

    // Check for existing pending invite
    const existing = await this.prisma.adminInvite.findFirst({
      where: { tenantId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException('A pending invite already exists for this tenant. Revoke it first.');
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48-hour expiry

    return this.prisma.adminInvite.create({
      data: {
        tenantId,
        email: dto.email,
        phone: dto.phone,
        name: dto.name,
        role: (dto.role || 'ADMIN') as any,
        expiresAt,
        status: 'PENDING',
      },
    });
  }

  async getInvites(tenantId: string) {
    return this.prisma.adminInvite.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(inviteId: string) {
    const invite = await this.prisma.adminInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Only pending invites can be revoked.');
    }
    return this.prisma.adminInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });
  }

  /** Validate and claim an invite token (called by the Auth module during onboarding) */
  async validateAndClaim(token: string) {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { token },
      include: { tenant: { select: { id: true, name: true, slug: true, status: true } } },
    });

    if (!invite) throw new NotFoundException('Invalid invite token.');
    if (invite.status !== 'PENDING') throw new BadRequestException('This invite has already been used or revoked.');
    if (invite.expiresAt < new Date()) {
      await this.prisma.adminInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('This invite has expired. Request a new one from your platform administrator.');
    }

    await this.prisma.adminInvite.update({
      where: { id: invite.id },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    });

    return invite;
  }
}
