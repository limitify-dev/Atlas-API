import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from 'src/prisma/prisma.service';
import { SmsService } from './sms.service';
import {
  InviteStatus,
  OnboardingMode,
  Role,
} from '../../prisma/generated/client';

export interface CreateInviteInput {
  tenantId: string;
  phone: string;
  email?: string;
  name?: string;
  role: Role;
  referenceId?: string;
  onboardingMode: OnboardingMode;
  createdBy: string;
}

@Injectable()
export class InviteService {
  private static readonly EXPIRY_DAYS = 7;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  async create(input: CreateInviteInput) {
    // Prevent duplicate active invites for the same phone in this tenant
    const existing = await this.prisma.invite.findFirst({
      where: {
        tenantId: input.tenantId,
        phone: input.phone,
        status: InviteStatus.PENDING,
      },
    });
    if (existing) {
      throw new ConflictException(
        'An active invite already exists for this phone number in this tenant. Use /auth/invite/resend to resend it.',
      );
    }

    // Prevent duplicate accounts
    const existingUser = await this.prisma.user.findFirst({
      where: { phone: input.phone, tenantId: input.tenantId },
    });
    if (existingUser) {
      throw new ConflictException(
        'A user account with this phone already exists in this tenant.',
      );
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + InviteService.EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const invite = await this.prisma.invite.create({
      data: {
        tenantId: input.tenantId,
        phone: input.phone,
        email: input.email,
        name: input.name,
        role: input.role,
        referenceId: input.referenceId,
        token,
        onboardingMode: input.onboardingMode,
        expiresAt,
        createdBy: input.createdBy,
      },
    });

    await this.sendInviteSms(invite.phone, invite.token, invite.onboardingMode);

    return invite;
  }

  async validate(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        tenant: {
          select: { id: true, name: true, logo: true, brandColor: true },
        },
      },
    });

    if (!invite) throw new NotFoundException('Invalid or unknown invite token.');

    if (invite.status === InviteStatus.CLAIMED) {
      throw new ConflictException('This invite has already been used.');
    }

    if (invite.status === InviteStatus.EXPIRED || invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new HttpException('This invite has expired.', HttpStatus.GONE);
    }

    return {
      token: invite.token,
      phone: invite.phone,
      name: invite.name,
      role: invite.role,
      onboardingMode: invite.onboardingMode,
      expiresAt: invite.expiresAt,
      school: {
        id: invite.tenant.id,
        name: invite.tenant.name,
        logo: invite.tenant.logo,
        brandColor: invite.tenant.brandColor,
      },
    };
  }

  async resend(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });

    if (!invite) throw new NotFoundException('Invalid or unknown invite token.');

    if (invite.status === InviteStatus.CLAIMED) {
      throw new ConflictException('This invite has already been used.');
    }

    // Generate a fresh token and reset expiry
    const newToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(
      Date.now() + InviteService.EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    );

    const updated = await this.prisma.invite.update({
      where: { id: invite.id },
      data: { token: newToken, expiresAt, status: InviteStatus.PENDING },
    });

    await this.sendInviteSms(updated.phone, updated.token, updated.onboardingMode);

    return { message: 'Invite resent successfully.' };
  }

  /** Mark invite as CLAIMED inside an external transaction or standalone. */
  async claim(inviteId: string, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;
    await db.invite.update({
      where: { id: inviteId },
      data: { status: InviteStatus.CLAIMED },
    });
  }

  /** Fetch a validated invite by token — throws if invalid/expired/claimed. */
  async getValidInvite(token: string) {
    const invite = await this.prisma.invite.findUnique({
      where: { token },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            timezone: true,
            logo: true,
            brandColor: true,
          },
        },
      },
    });

    if (!invite) throw new NotFoundException('Invalid or unknown invite token.');
    if (invite.status === InviteStatus.CLAIMED) {
      throw new ConflictException('This invite has already been used.');
    }
    if (invite.status === InviteStatus.EXPIRED || invite.expiresAt < new Date()) {
      await this.prisma.invite.update({
        where: { id: invite.id },
        data: { status: InviteStatus.EXPIRED },
      });
      throw new HttpException('This invite has expired.', HttpStatus.GONE);
    }

    return invite;
  }

  private async sendInviteSms(
    phone: string,
    token: string,
    mode: OnboardingMode,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    const link = `${frontendUrl}/onboarding?token=${token}`;
    const modeNote =
      mode === OnboardingMode.OTP
        ? 'You will verify your identity via SMS code.'
        : 'You will set a password to secure your account.';

    await this.sms.sendSms(
      phone,
      `You've been invited to join Atlas School Management. ${modeNote} Complete your registration here: ${link}`,
    );
  }
}
