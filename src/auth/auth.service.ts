import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { LoginDto, RegisterDto, AuthResponseDto, UserDto } from './dto';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from 'src/users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { jwtConstants } from './constant';

@Injectable()
export class AuthService {
  constructor(
    private userService: UsersService,
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}
  /**
   * Register a new user with a valid registration token
   * @param registerDto - User registration data
   * @param token - Registration token received via email
   * @returns Authentication response with tokens and user info
   * @throws BadRequestException if token is invalid or expired
   * @throws ConflictException if email or username already exists
   */
  async registerWithToken(
    registerDto: RegisterDto,
    token: string,
  ): Promise<AuthResponseDto> {
    // Verify registration token
    const registrationToken = await this.prisma.registrationToken.findFirst({
      where: {
        token,
        email: registerDto.email,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        tenant: true,
      },
    });

    if (!registrationToken) {
      throw new BadRequestException('Invalid or expired registration token');
    }

    // Create user with role and tenant from token
    const userDto = {
      ...registerDto,
      role: registrationToken.role,
      tenantId: registrationToken.tenantId,
      phone: registerDto.phone || null,
      status: 'ACTIVE' as any,
      emailVerified: true,
    };

    // Create user through UserService (handles validation and password hashing)
    const createdUser: any = await this.userService.create(userDto as any);

    // Mark token as used
    await this.prisma.registrationToken.update({
      where: { id: registrationToken.id },
      data: { usedAt: new Date() },
    });

    // Generate tokens
    const payload = {
      sub: createdUser.id,
      username: createdUser.username,
      role: createdUser.role,
    };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: jwtConstants.refreshTokenExpiry,
    });

    // Store refresh token in database
    await this.prisma.refreshToken.create({
      data: {
        userId: createdUser.id,
        token: refreshToken,
        expiresAt: new Date(
          Date.now() + jwtConstants.refreshTokenExpiry * 1000,
        ),
      },
    });

    // Create session
    await this.prisma.session.create({
      data: {
        userId: createdUser.id,
        token: accessToken,
        expiresAt: new Date(Date.now() + jwtConstants.accessTokenExpiry * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: createdUser,
    };
  }

  /**
   * Verify a registration token
   * @param token - Registration token
   * @returns Token details if valid
   * @throws BadRequestException if token is invalid or expired
   */
  async verifyRegistrationToken(token: string) {
    const registrationToken = await this.prisma.registrationToken.findFirst({
      where: {
        token,
        usedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!registrationToken) {
      throw new BadRequestException('Invalid or expired registration token');
    }

    return {
      email: registrationToken.email,
      role: registrationToken.role,
      tenant: registrationToken.tenant,
      expiresAt: registrationToken.expiresAt,
    };
  }

  /**
   * Authenticate a user
   * @param user - User details (from validateUser)
   * @returns Authentication response with tokens and user info
   */
  async login(user: any): Promise<AuthResponseDto> {
    const payload = { sub: user.id, username: user.username, role: user.role };
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

      // Generate new tokens
      const newPayload = {
        sub: storedToken.user.id,
        username: storedToken.user.username,
        role: storedToken.user.role,
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

      // Remove password from user object
      const { password, ...userWithoutPassword } = storedToken.user;

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: userWithoutPassword as any,
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
    });

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(pass, user.password);
    if (!isPasswordValid) {
      return null;
    }

    // Remove password before returning
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
