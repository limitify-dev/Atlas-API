import {
  Controller,
  Post,
  Body,
  Get,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto, AuthResponseDto } from './dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Register a new user with token',
    description:
      'Creates a new user account using a valid registration token received via email. Public signup is disabled - users must receive a registration token from a super admin.',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiConflictResponse({
    description: 'Email or username already exists',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 409 },
        message: { type: 'string', example: 'Email already exists' },
        error: { type: 'string', example: 'Conflict' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data or registration token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: {
          oneOf: [
            { type: 'string', example: 'Invalid or expired registration token' },
            {
              type: 'array',
              items: { type: 'string' },
              example: ['email must be a valid email address'],
            },
          ],
        },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  async register(
    @Body() body: { registerDto: RegisterDto; token: string },
  ): Promise<AuthResponseDto> {
    return this.authService.registerWithToken(body.registerDto, body.token);
  }

  @Get('verify-registration-token')
  @ApiOperation({
    summary: 'Verify registration token',
    description:
      'Verifies a registration token and returns the associated tenant and role information.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token is valid',
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'admin@school.edu' },
        role: { type: 'string', example: 'ADMIN' },
        tenant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Springfield Elementary' },
            slug: { type: 'string', example: 'springfield-elementary' },
          },
        },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired token',
  })
  async verifyRegistrationToken(@Query('token') token: string) {
    return this.authService.verifyRegistrationToken(token);
  }

  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticates a user with email and password. Returns access token, refresh token, and user information.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully authenticated',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Invalid email or password' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data',
  })
  async login(@Request() req: any): Promise<AuthResponseDto> {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req: any): Promise<any> {
    return req.user;
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Generates a new access token and refresh token using a valid refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens successfully refreshed',
    type: AuthResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Body() body: { refreshToken: string },
  ): Promise<AuthResponseDto> {
    return this.authService.refreshToken(body.refreshToken);
  }

  @Post('logout')
  @ApiOperation({
    summary: 'User logout',
    description:
      'Invalidates the current session and refresh token. Requires authentication.',
  })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged out',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Logged out successfully' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
  })
  async logout(
    @Body() body: { userId: string; sessionToken: string },
  ): Promise<{ message: string }> {
    await this.authService.logout(body.userId, body.sessionToken);
    return { message: 'Logged out successfully' };
  }

  @Get('verify-email')
  @ApiOperation({
    summary: 'Verify user email',
    description:
      'Verifies user email address using the token sent to their email.',
  })
  @ApiResponse({
    status: 200,
    description: 'Email successfully verified',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Email verified successfully' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired verification token',
  })
  async verifyEmail(
    @Query('token') token: string,
  ): Promise<{ message: string }> {
    return this.authService.verifyEmail(token);
  }

  @Post('request-password-reset')
  @ApiOperation({
    summary: 'Request password reset',
    description:
      'Sends a password reset email to the user if the email exists in the system.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset email sent' },
      },
    },
  })
  async requestPasswordReset(
    @Body() body: { email: string },
  ): Promise<{ message: string }> {
    return this.authService.requestPasswordReset(body.email);
  }

  @Post('reset-password')
  @ApiOperation({
    summary: 'Reset password',
    description:
      'Resets user password using the token sent to their email. All existing sessions will be invalidated.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password successfully reset',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password reset successfully' },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid or expired reset token',
  })
  async resetPassword(
    @Body() body: { token: string; newPassword: string },
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
