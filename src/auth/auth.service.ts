import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthResponseDto } from './dto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { jwtConstants } from './constant';
import { EmailService } from 'src/email/email.service';
import { Role, UserType, Status, User, OnboardingMode } from '../../prisma/generated/client';
import { InviteService } from './invite.service';
import { OtpService } from './otp.service';
import { CompleteOnboardingDto } from './dto';

export type AuthenticatedUser = Omit<User, 'password'> & {
  schoolName: string | null;
  schoolLogo: string | null;
  brandColor: string;
  timezone: string;
};

@Injectable()
export class AuthService {
  private static readonly DEFAULT_PARENT_PASSWORD = 'Parent@123';
  private static readonly PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 30 * 60;
  private static readonly PASSWORD_RESET_COOLDOWN_DAYS = 14;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
    private inviteService: InviteService,
    private otpService: OtpService,
  ) {}

  private getPasswordResetCooldownBoundary(): Date {
    return new Date(
      Date.now() -
        AuthService.PASSWORD_RESET_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
    );
  }
  /**
   * Authenticate a user
   * @param user - User details (from validateUser)
   * @returns Authentication response with tokens and user info
   */
  async login(user: AuthenticatedUser): Promise<AuthResponseDto> {
    const payload = {
      sub: user.id,
      username: user.username,
      userType: user.userType,
      role: user.role,
      tenantId: user.tenantId,
      timezone: user.timezone,
      schoolName: user.schoolName,
      schoolLogo: user.schoolLogo,
      brandColor: user.brandColor,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: jwtConstants.refreshTokenExpiry,
    });

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(
          Date.now() + jwtConstants.refreshTokenExpiry * 1000,
        ),
      },
    });

    // Create session
    await this.prisma.session.create({
      data: {
        userId: user.id,
        token: accessToken,
        expiresAt: new Date(Date.now() + jwtConstants.accessTokenExpiry * 1000),
      },
    });

    // Update last login time
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      accessToken,
      refreshToken,
      user,
    };
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken - Valid refresh token
   * @returns New access token and refresh token
   * @throws UnauthorizedException if refresh token is invalid
   */
  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    try {
      // Verify the refresh token
      interface JwtPayload {
        sub: string;
        [key: string]: unknown;
      }
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: jwtConstants.secret,
      });

      // Check if refresh token exists in database and is not expired
      const storedToken = await this.prisma.refreshToken.findFirst({
        where: {
          token: refreshToken,
          userId: payload.sub,
          expiresAt: {
            gt: new Date(),
          },
        },
        include: {
          user: true,
        },
      });

      if (!storedToken) {
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      // Fetch tenant data for timezone, schoolName, logo and brandColor
      const userWithTenant = await this.prisma.user.findUnique({
        where: { id: storedToken.user.id },
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
          teacher: {
            select: {
              photoUrl: true,
            },
          },
          student: {
            select: {
              photoUrl: true,
            },
          },
        },
      });

      // Generate new tokens
      const newPayload = {
        sub: storedToken.user.id,
        username: storedToken.user.username,
        userType: storedToken.user.userType,
        role: storedToken.user.role,
        tenantId: storedToken.user.tenantId,
        timezone: userWithTenant?.tenant?.timezone || 'UTC',
        schoolName: userWithTenant?.tenant?.name,
        schoolLogo: userWithTenant?.tenant?.logo || null,
        brandColor: userWithTenant?.tenant?.brandColor || '#1e40af',
      };
      const newAccessToken = this.jwtService.sign(newPayload);
      const newRefreshToken = this.jwtService.sign(newPayload, {
        expiresIn: jwtConstants.refreshTokenExpiry,
      });

      // Delete old refresh token
      await this.prisma.refreshToken.delete({
        where: { id: storedToken.id },
      });

      // Store new refresh token
      await this.prisma.refreshToken.create({
        data: {
          userId: storedToken.user.id,
          token: newRefreshToken,
          expiresAt: new Date(
            Date.now() + jwtConstants.refreshTokenExpiry * 1000,
          ),
        },
      });

      // Create new session
      await this.prisma.session.create({
        data: {
          userId: storedToken.user.id,
          token: newAccessToken,
          expiresAt: new Date(
            Date.now() + jwtConstants.accessTokenExpiry * 1000,
          ),
        },
      });

      // Remove password and flatten tenant data
      const { tenant, teacher, student, ...userWithoutPassword } =
        userWithTenant!;

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          ...userWithoutPassword,
          avatar:
            userWithoutPassword.avatar ||
            teacher?.photoUrl ||
            student?.photoUrl ||
            null,
          userType: userWithTenant?.userType,
          timezone: tenant?.timezone || 'UTC',
          schoolName: tenant?.name,
          schoolLogo: tenant?.logo || null,
          brandColor: tenant?.brandColor || '#1e40af',
        },
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
  /**
   * Validate a user's information
   * @param identifier - User's username or email
   * @param password -  User's password
   */
  async validateUser(
    identifier: string,
    pass: string,
  ): Promise<AuthenticatedUser | null> {
    // Check if identifier is email, username, or phone
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier },
          { phone: identifier },
        ],
      },
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
        teacher: {
          select: {
            photoUrl: true,
          },
        },
        student: {
          select: {
            photoUrl: true,
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    // Block non-active accounts before touching the password hash
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(
        user.status === 'SUSPENDED'
          ? 'Your account has been suspended. Contact your school administrator.'
          : 'Your account is not yet active. Contact your school administrator.',
      );
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      return null;
    }

    const isParentUser = user.role === 'PARENT' || user.userType === 'PARENT';
    if (isParentUser) {
      const usingDefaultPassword = await bcrypt.compare(
        AuthService.DEFAULT_PARENT_PASSWORD,
        user.password,
      );

      if (usingDefaultPassword) {
        throw new ForbiddenException({
          code: 'DEFAULT_PASSWORD_CHANGE_REQUIRED',
          message:
            'Default parent password detected. Please change your password to continue.',
        });
      }
    }

    // Remove password before returning and flatten tenant data
    const { password, tenant, teacher, student, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      avatar:
        userWithoutPassword.avatar ||
        teacher?.photoUrl ||
        student?.photoUrl ||
        null,
      userType: user.userType ?? null,
      schoolName: tenant?.name ?? null,
      schoolLogo: tenant?.logo ?? null,
      brandColor: tenant?.brandColor ?? '#1e40af',
      timezone: tenant?.timezone ?? 'UTC',
    };
  }

  async changeDefaultPassword(
    identifier: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    if (!identifier || !currentPassword || !newPassword) {
      throw new BadRequestException(
        'Identifier, currentPassword and newPassword are required',
      );
    }

    if (newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters long',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isParentUser = user.role === 'PARENT' || user.userType === 'PARENT';
    if (!isParentUser) {
      throw new ForbiddenException(
        'Default password change flow is only available for parents',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const isStillDefault = await bcrypt.compare(
      AuthService.DEFAULT_PARENT_PASSWORD,
      user.password,
    );
    if (!isStillDefault) {
      throw new BadRequestException('Password has already been changed');
    }

    if (newPassword === AuthService.DEFAULT_PARENT_PASSWORD) {
      throw new BadRequestException('Please choose a different password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate old sessions/tokens tied to the default password.
    await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return {
      message:
        'Password updated successfully. Please sign in with your new password.',
    };
  }
  /**
   * Logout user and invalidate tokens
   * @param userId - User ID to logout
   * @param sessionToken - Session token to invalidate
   */
  async logout(userId: string, sessionToken: string): Promise<void> {
    // Delete the session
    await this.prisma.session.deleteMany({
      where: {
        userId,
        token: sessionToken,
      },
    });

    // Delete all refresh tokens for this user (logout from all devices)
    // You can modify this to only delete specific tokens if you want per-device logout
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  /**
   * Register a new user (public endpoint for invite links)
   * @param registerData - User registration data
   * @returns Created user without password
   * @throws ConflictException if email or username already exists
   * @throws BadRequestException if required fields are missing
   */
  async register(registerData: {
    email: string;
    name: string;
    username: string;
    password: string;
    role: string;
    tenantId?: string;
    userType?: string;
    status?: string;
  }) {
    // Validate required fields
    if (
      !registerData.email ||
      !registerData.name ||
      !registerData.username ||
      !registerData.password ||
      !registerData.role
    ) {
      throw new BadRequestException('Missing required registration fields');
    }

    // Check if email already exists
    const existingEmail = await this.prisma.user.findUnique({
      where: { email: registerData.email },
    });
    if (existingEmail) {
      throw new ConflictException('Email already exists');
    }

    // Check if username already exists
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: registerData.username },
    });
    if (existingUsername) {
      throw new ConflictException('Username already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerData.password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: registerData.email,
        name: registerData.name,
        username: registerData.username,
        password: hashedPassword,
        role: registerData.role ? (registerData.role as Role) : Role.USER,
        tenantId: registerData.tenantId ?? null,
        userType: registerData.userType
          ? (registerData.userType as UserType)
          : null,
        status: registerData.status
          ? (registerData.status as Status)
          : Status.ACTIVE,
        emailVerified: true,
      },
    });

    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Get user profile by ID
   * @param userId - User ID
   * @returns Full user profile without password
   */
  async getProfile(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
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
        teacher: {
          select: {
            photoUrl: true,
          },
        },
        student: {
          select: {
            photoUrl: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Remove password and flatten tenant data
    const { password, tenant, teacher, student, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      avatar:
        userWithoutPassword.avatar ||
        teacher?.photoUrl ||
        student?.photoUrl ||
        null,
      userType: user.userType,
      timezone: tenant?.timezone || 'UTC',
      schoolName: tenant?.name,
      schoolLogo: tenant?.logo || null,
      brandColor: tenant?.brandColor || '#1e40af',
    };
  }

  /**
   * Verify user email
   * @param token - Email verification token
   * @returns Success message
   * @throws BadRequestException if token is invalid
   */

  async verifyEmail(token: string): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Verification token is required');
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: jwtConstants.secret,
      });
    } catch {
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (!payload?.sub || payload.type !== 'email_verification') {
      throw new BadRequestException('Invalid verification token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    return { message: 'Email verified successfully' };
  }

  /**
   * Request password reset
   * @param email - User email address
   * @returns Success message
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const normalizedEmail = (email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException('Email is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        status: true,
        passwordChangedAt: true,
      },
    });

    // Keep response generic to prevent account enumeration.
    if (!user || user.status !== 'ACTIVE' || !user.email) {
      return { message: 'If the email exists, a reset link has been sent.' };
    }

    if (
      user.passwordChangedAt &&
      user.passwordChangedAt > this.getPasswordResetCooldownBoundary()
    ) {
      throw new BadRequestException(
        `Password was recently updated. You can request another reset after ${AuthService.PASSWORD_RESET_COOLDOWN_DAYS} days.`,
      );
    }

    const token = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        type: 'password_reset',
      },
      {
        secret: jwtConstants.secret,
        expiresIn: AuthService.PASSWORD_RESET_TOKEN_EXPIRY_SECONDS,
      },
    );

    await this.emailService.sendPasswordResetEmail(user.email, token);

    return { message: 'Password reset email sent' };
  }

  /**
   * Complete invite-based onboarding for parent (OTP) or teacher/staff (password).
   * Creates the user account, links the profile, and returns auth tokens.
   */
  async completeOnboarding(dto: CompleteOnboardingDto): Promise<AuthResponseDto> {
    const invite = await this.inviteService.getValidInvite(dto.token);

    // Phone must match the invite exactly
    if (dto.phone.trim() !== invite.phone) {
      throw new BadRequestException(
        'Phone number does not match the invitation.',
      );
    }

    if (invite.onboardingMode === OnboardingMode.OTP) {
      const verified = await this.otpService.isVerifiedForInvite(
        dto.phone,
        dto.token,
      );
      if (!verified) {
        throw new BadRequestException(
          'Phone verification required. Complete OTP verification before submitting.',
        );
      }
    } else {
      // PASSWORD mode
      if (!dto.password || dto.password.length < 8) {
        throw new BadRequestException(
          'A password of at least 8 characters is required.',
        );
      }
    }

    // Prevent duplicate accounts (phone globally unique)
    const existingPhone = await this.prisma.user.findUnique({
      where: { phone: dto.phone },
    });
    if (existingPhone) {
      throw new ConflictException(
        'An account with this phone number already exists.',
      );
    }

    // Optional: prevent duplicate email
    if (dto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: dto.email },
      });
      if (existingEmail) {
        throw new ConflictException('An account with this email already exists.');
      }
    }

    // Generate a unique username from phone digits
    const baseUsername = `user${dto.phone.replace(/\D/g, '')}`;
    const taken = await this.prisma.user.findUnique({ where: { username: baseUsername } });
    const username = taken ? `${baseUsername}_${Date.now()}` : baseUsername;

    const rawPassword = dto.password ?? `ATLAS_${crypto.randomUUID()}`;
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const userType = this.roleToUserType(invite.role);

    const newUser = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId: invite.tenantId,
          name: dto.name,
          email: dto.email ?? null,
          phone: dto.phone,
          username,
          password: hashedPassword,
          role: invite.role,
          userType,
          status: Status.ACTIVE,
          emailVerified: !!dto.email === false,
        },
      });

      // Link profile based on role
      if (invite.role === Role.PARENT) {
        const nameParts = dto.name.trim().split(/\s+/);
        const firstName = nameParts[0] ?? 'Parent';
        const lastName = nameParts.slice(1).join(' ') || '';

        const parent = await tx.parent.create({
          data: {
            tenantId: invite.tenantId,
            userId: created.id,
            firstName,
            lastName,
          },
        });

        if (invite.referenceId) {
          await tx.studentParent.create({
            data: {
              studentId: invite.referenceId,
              parentId: parent.id,
              isPrimary: true,
            },
          });
        }
      } else if (invite.role === Role.TEACHER && invite.referenceId) {
        await tx.teacher.update({
          where: { id: invite.referenceId },
          data: { userId: created.id },
        });
      } else if (invite.role === Role.STAFF && invite.referenceId) {
        await tx.staff.update({
          where: { id: invite.referenceId },
          data: { userId: created.id },
        });
      }

      // Claim invite and purge OTPs inside the transaction
      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'CLAIMED' },
      });
      await tx.otpCode.deleteMany({ where: { inviteToken: dto.token } });

      return created;
    });

    const tenant = invite.tenant;
    const authenticatedUser: AuthenticatedUser = {
      ...newUser,
      schoolName: tenant?.name ?? null,
      schoolLogo: tenant?.logo ?? null,
      brandColor: tenant?.brandColor ?? '#1e40af',
      timezone: tenant?.timezone ?? 'UTC',
    };

    return this.login(authenticatedUser);
  }

  /**
   * Authenticate a parent via a verified login OTP (phone-first flow).
   * The caller must have already called POST /auth/otp/verify successfully.
   */
  async loginWithVerifiedOtp(phone: string): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: { phone },
      include: {
        tenant: {
          select: { id: true, name: true, timezone: true, logo: true, brandColor: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('No account found for this phone number.');
    }

    if (user.status !== Status.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }

    // Ensure OTP was genuinely verified (the OTP record still exists as verified)
    const verified = await this.prisma.otpCode.findFirst({
      where: { phone, purpose: 'LOGIN', verified: true },
    });
    if (!verified) {
      throw new UnauthorizedException(
        'OTP not verified. Please complete OTP verification first.',
      );
    }

    // Clean up login OTPs before issuing tokens
    await this.otpService.purgeLoginOtps(phone);

    const { password, tenant, ...rest } = user;
    const authenticatedUser: AuthenticatedUser = {
      ...rest,
      schoolName: tenant?.name ?? null,
      schoolLogo: tenant?.logo ?? null,
      brandColor: tenant?.brandColor ?? '#1e40af',
      timezone: tenant?.timezone ?? 'UTC',
    };

    return this.login(authenticatedUser);
  }

  private roleToUserType(role: Role): UserType | null {
    const map: Partial<Record<Role, UserType>> = {
      [Role.PARENT]: UserType.PARENT,
      [Role.TEACHER]: UserType.TEACHER,
      [Role.STAFF]: UserType.STAFF,
    };
    return map[role] ?? null;
  }

  /**
   * Reset password using reset token
   * @param token - Password reset token
   * @param newPassword - New password
   * @returns Success message
   * @throws BadRequestException if token is invalid
   */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    if (!token) {
      throw new BadRequestException('Reset token is required');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException(
        'New password must be at least 8 characters long',
      );
    }

    let payload: { sub?: string; type?: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: jwtConstants.secret,
      });
    } catch (_error) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!payload?.sub || payload.type !== 'password_reset') {
      throw new BadRequestException('Invalid reset token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date(),
      },
    });

    // Invalidate existing sessions/tokens so reset takes effect immediately.
    await Promise.all([
      this.prisma.refreshToken.deleteMany({ where: { userId: user.id } }),
      this.prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    return { message: 'Password reset successfully' };
  }
}
