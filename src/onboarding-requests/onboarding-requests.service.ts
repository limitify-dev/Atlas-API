import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { Role, OnboardingRequestStatus } from '../../prisma/generated/client';
import {
  CreateOnboardingRequestDto,
  UpdateOnboardingRequestDto,
} from './dto';

@Injectable()
export class OnboardingRequestsService {
  private readonly logger = new Logger(OnboardingRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async create(dto: CreateOnboardingRequestDto) {
    const request = await this.prisma.onboardingRequest.create({
      data: {
        intent: dto.intent,
        fullName: dto.fullName,
        email: dto.email,
        phone: dto.phone,
        organization: dto.organization,
        role: dto.role,
        schoolSize: dto.schoolSize,
        preferredDate: dto.preferredDate ? new Date(dto.preferredDate) : null,
        preferredTime: dto.preferredTime,
        goals: dto.goals,
      },
    });

    // Best-effort — a misconfigured mail server must never fail the
    // requester's submission. The request is already saved either way.
    void this.notifySuperAdmins(request).catch((err) => {
      this.logger.error('Failed to notify super-admins of new onboarding request', err);
    });

    return request;
  }

  private async notifySuperAdmins(request: {
    fullName: string;
    email: string;
    phone: string;
    organization: string;
    role: string;
    schoolSize: string;
    goals: string;
  }) {
    const superAdmins = await this.prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN, status: 'ACTIVE' },
      select: { email: true },
    });

    const webUrl = (
      this.config.get<string>('WEB_URL') ||
      this.config.get<string>('FRONTEND_URL') ||
      'http://localhost:3000'
    ).replace(/\/$/, '');
    const studioUrl = `${webUrl}/studio/onboarding-requests`;

    await Promise.all(
      superAdmins
        .filter((admin) => admin.email)
        .map((admin) =>
          this.email.sendOnboardingRequestNotification({
            to: admin.email as string,
            fullName: request.fullName,
            email: request.email,
            phone: request.phone,
            organization: request.organization,
            role: request.role,
            schoolSize: request.schoolSize,
            goals: request.goals,
            studioUrl,
          }),
        ),
    );
  }

  async findAll(status?: OnboardingRequestStatus) {
    return this.prisma.onboardingRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { reviewedBy: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateOnboardingRequestDto, reviewerId: string) {
    const existing = await this.prisma.onboardingRequest.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Onboarding request not found.');
    }

    return this.prisma.onboardingRequest.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        reviewedAt: new Date(),
        reviewedById: reviewerId,
      },
    });
  }
}
