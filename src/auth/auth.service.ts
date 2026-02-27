import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthResponseDto } from './dto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { jwtConstants } from './constant';
import { UserType } from '../../prisma/generated/client';
import { EmailService } from 'src/email/email.service';

@Injectable()
export class AuthService {
  private static readonly DEFAULT_PARENT_PASSWORD = 'Parent@123';
  private static readonly PASSWORD_RESET_TOKEN_EXPIRY_SECONDS = 30 * 60;
  private static readonly PASSWORD_RESET_COOLDOWN_DAYS = 14;

  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private emailService: EmailService,
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
  async login(user: any): Promise<AuthResponseDto> {
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
      const payload = this.jwtService.verify(refreshToken, {
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
      const { password, tenant, teacher, student, ...userWithoutPassword } =
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
        } as any,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
  /**
   * Validate a user's information
   * @param identifier - User's username or email
   * @param password -  User's password
   */
  async validateUser(identifier: string, pass: string): Promise<any | null> {
    // Fetch user with password from database directly for validation
    // Check if identifier is email or username
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: identifier }, { email: identifier }],
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
      userType: user.userType,
      schoolName: tenant?.name,
      schoolLogo: tenant?.logo || null,
      brandColor: tenant?.brandColor || '#1e40af',
      timezone: tenant?.timezone || 'UTC',
    };
  }

  async changeDefaultPassword(
    identifier: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    if (!identifier || !currentPassword || !newPassword) {
      throw new BadRequestException('Identifier, currentPassword and newPassword are required');
    }

    if (newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters long');
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
      throw new ForbiddenException('Default password change flow is only available for parents');
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

    return { message: 'Password updated successfully. Please sign in with your new password.' };
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
        role: registerData.role as any,
        tenantId: registerData.tenantId || null,
        userType: (registerData.userType as any) || null,
        status: (registerData.status as any) || 'ACTIVE',
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
    if (!user || user.status !== 'ACTIVE') {
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
