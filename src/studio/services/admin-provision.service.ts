import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { CreateAdminInviteDto } from '../dto';

@Injectable()
export class AdminProvisionService {
  private readonly logger = new Logger(AdminProvisionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  private inviteUrl(token: string): string {
    const base =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${base.replace(/\/$/, '')}/admin-setup?token=${token}`;
  }

  /**
   * Generate a single-use admin invite for a tenant.
   * Sends an email if the invite has an email address.
   */
  async createInvite(tenantId: string, dto: CreateAdminInviteDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant not found.');

    if (!dto.email && !dto.phone) {
      throw new BadRequestException(
        'Either email or phone is required for the invite.',
      );
    }

    // Check for existing pending invite
    const existing = await this.prisma.adminInvite.findFirst({
      where: { tenantId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException(
        'A pending invite already exists for this tenant. Revoke it first.',
      );
    }

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    const invite = await this.prisma.adminInvite.create({
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

    let emailSent = false;
    let emailError: string | undefined;
    if (invite.email) {
      try {
        await this.email.sendAdminInviteEmail({
          email: invite.email,
          name: invite.name ?? undefined,
          tenantName: tenant.name ?? 'your school',
          inviteUrl: this.inviteUrl(invite.token),
        });
        emailSent = true;
      } catch (err) {
        // Email failure is non-fatal — the invite link is still valid and can
        // be copied from Studio, but surface it so it isn't silently lost.
        emailError = err instanceof Error ? err.message : 'Unknown email error';
        this.logger.error(
          `Admin invite ${invite.id} for ${invite.email} was created but the email failed: ${emailError}`,
        );
      }
    }

    return { ...invite, emailSent, emailError };
  }

  async getInvites(tenantId: string) {
    return this.prisma.adminInvite.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvite(inviteId: string) {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Only pending invites can be revoked.');
    }
    return this.prisma.adminInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    });
  }

  async deleteInvite(inviteId: string) {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { id: inviteId },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    await this.prisma.adminInvite.delete({ where: { id: inviteId } });
    return { message: 'Invite deleted.' };
  }

  async resendInvite(inviteId: string) {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { id: inviteId },
      include: { tenant: { select: { name: true } } },
    });
    if (!invite) throw new NotFoundException('Invite not found.');
    if (invite.status !== 'PENDING') {
      throw new BadRequestException('Only pending invites can be resent.');
    }
    if (!invite.email) {
      throw new BadRequestException('This invite has no email address.');
    }

    // Extend expiry by another 48 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);
    await this.prisma.adminInvite.update({
      where: { id: inviteId },
      data: { expiresAt },
    });

    try {
      await this.email.sendAdminInviteEmail({
        email: invite.email,
        name: invite.name ?? undefined,
        tenantName: invite.tenant.name ?? 'your school',
        inviteUrl: this.inviteUrl(invite.token),
      });
    } catch (err) {
      const emailError =
        err instanceof Error ? err.message : 'Unknown email error';
      this.logger.error(
        `Resend of admin invite ${invite.id} to ${invite.email} failed: ${emailError}`,
      );
      return {
        message:
          'Invite expiry extended, but the email could not be sent. Check SMTP configuration; the invite link can be shared manually.',
        emailSent: false,
        emailError,
      };
    }

    return { message: 'Invite resent successfully.', emailSent: true };
  }

  /** Validate and claim an invite token (called by the Auth module during onboarding) */
  async validateAndClaim(token: string) {
    const invite = await this.prisma.adminInvite.findUnique({
      where: { token },
      include: {
        tenant: { select: { id: true, name: true, slug: true, status: true } },
      },
    });

    if (!invite) throw new NotFoundException('Invalid invite token.');
    if (invite.status !== 'PENDING')
      throw new BadRequestException(
        'This invite has already been used or revoked.',
      );
    if (invite.expiresAt < new Date()) {
      await this.prisma.adminInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException(
        'This invite has expired. Request a new one from your platform administrator.',
      );
    }

    await this.prisma.adminInvite.update({
      where: { id: invite.id },
      data: { status: 'CLAIMED', claimedAt: new Date() },
    });

    return invite;
  }
}
