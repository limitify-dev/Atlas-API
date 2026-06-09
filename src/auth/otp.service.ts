import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { SmsService } from './sms.service';
import { OtpPurpose } from '../../prisma/generated/client';

@Injectable()
export class OtpService {
  private static readonly EXPIRY_MINUTES = 5;
  private static readonly MAX_ATTEMPTS = 3;
  private static readonly RESEND_COOLDOWN_SECONDS = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Send an OTP to the given phone.
   * - inviteToken: set for onboarding OTPs, null for login OTPs.
   * - purpose: ONBOARDING | LOGIN
   */
  async send(
    phone: string,
    purpose: OtpPurpose,
    tenantId?: string,
    inviteToken?: string,
  ): Promise<{ message: string }> {
    // Enforce resend cooldown
    const cooldownBoundary = new Date(
      Date.now() - OtpService.RESEND_COOLDOWN_SECONDS * 1000,
    );
    const recent = await this.prisma.otpCode.findFirst({
      where: { phone, purpose, createdAt: { gte: cooldownBoundary } },
    });
    if (recent) {
      throw new HttpException(
        `Please wait ${OtpService.RESEND_COOLDOWN_SECONDS} seconds before requesting a new code.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Invalidate all previous OTPs for this phone + purpose
    await this.prisma.otpCode.deleteMany({ where: { phone, purpose } });

    const code = this.generateCode();
    const expiresAt = new Date(
      Date.now() + OtpService.EXPIRY_MINUTES * 60 * 1000,
    );

    await this.prisma.otpCode.create({
      data: { phone, tenantId, inviteToken, purpose, code, expiresAt },
    });

    await this.sms.sendSms(
      phone,
      `Your Atlas verification code is: ${code}. Valid for ${OtpService.EXPIRY_MINUTES} minutes. Do not share this code.`,
    );

    return { message: 'OTP sent successfully.' };
  }

  /**
   * Verify an OTP code.
   * - For ONBOARDING purpose: marks OTP as verified and returns (call completeOnboarding next).
   * - For LOGIN purpose: marks OTP as verified and returns the verified OTP id for the caller to exchange for tokens.
   */
  async verify(
    phone: string,
    purpose: OtpPurpose,
    code: string,
    inviteToken?: string,
  ): Promise<{ verified: true; otpId: string }> {
    const where: any = { phone, purpose, verified: false };
    if (inviteToken) where.inviteToken = inviteToken;

    const otp = await this.prisma.otpCode.findFirst({ where });

    if (!otp) {
      throw new NotFoundException(
        'No pending OTP found for this phone. Please request a new code.',
      );
    }

    if (new Date() > otp.expiresAt) {
      await this.prisma.otpCode.delete({ where: { id: otp.id } });
      throw new BadRequestException(
        'OTP has expired. Please request a new code.',
      );
    }

    if (otp.attempts >= OtpService.MAX_ATTEMPTS) {
      await this.prisma.otpCode.delete({ where: { id: otp.id } });
      throw new HttpException(
        'Maximum verification attempts exceeded. Please request a new code.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (otp.code !== code) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });
      const remaining = OtpService.MAX_ATTEMPTS - (otp.attempts + 1);
      throw new BadRequestException(
        `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: { verified: true },
    });

    return { verified: true, otpId: otp.id };
  }

  /** Check whether a verified onboarding OTP exists for invite + phone (called from completeOnboarding). */
  async isVerifiedForInvite(
    phone: string,
    inviteToken: string,
  ): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: {
        phone,
        inviteToken,
        purpose: OtpPurpose.ONBOARDING,
        verified: true,
      },
    });
    return otp !== null;
  }

  /** Delete all OTPs tied to an invite token (called after successful onboarding). */
  async purgeByInviteToken(inviteToken: string): Promise<void> {
    await this.prisma.otpCode.deleteMany({ where: { inviteToken } });
  }

  /** Delete all login OTPs for a phone after successful login. */
  async purgeLoginOtps(phone: string): Promise<void> {
    await this.prisma.otpCode.deleteMany({
      where: { phone, purpose: OtpPurpose.LOGIN },
    });
  }

  private generateCode(): string {
    return Math.floor(100_000 + Math.random() * 900_000).toString();
  }
}
