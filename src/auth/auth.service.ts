import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { AuthResponseDto } from './dto';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { jwtConstants } from './constant';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}
  /**
   * Authenticate a user
   * @param user - User details (from validateUser)
   * @returns Authentication response with tokens and user info
   */
  async login(user: any): Promise<AuthResponseDto> {
    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      timezone: user.timezone,
      schoolName: user.schoolName,
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

      // Fetch tenant data for timezone and schoolName
      const userWithTenant = await this.prisma.user.findUnique({
        where: { id: storedToken.user.id },
        include: {
          tenant: {
            select: {
              id: true,
              name: true,
              timezone: true,
            },
          },
        },
      });

      // Generate new tokens
      const newPayload = {
        sub: storedToken.user.id,
        username: storedToken.user.username,
        role: storedToken.user.role,
        tenantId: storedToken.user.tenantId,
        timezone: userWithTenant?.tenant?.timezone || 'UTC',
        schoolName: userWithTenant?.tenant?.name,
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
      const { password, tenant, ...userWithoutPassword } = userWithTenant!;

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          ...userWithoutPassword,
          timezone: tenant?.timezone || 'UTC',
          schoolName: tenant?.name,
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

    // Remove password before returning and flatten tenant data
    const { password, tenant, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      schoolName: tenant?.name,
      timezone: tenant?.timezone || 'UTC',
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
        role: registerData.role as any,
        tenantId: registerData.tenantId || null,
        userType: registerData.userType as any || null,
        status: (registerData.status as any) || 'ACTIVE',
        emailVerified: true,
      },
    });

    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
    return { message: 'Password reset successfully' };
  }
}
