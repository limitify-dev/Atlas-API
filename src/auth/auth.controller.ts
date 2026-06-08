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
import { AuthService, AuthenticatedUser } from './auth.service';
import {
  AuthResponseDto,
  CompleteOnboardingDto,
  CreateInviteDto,
  ResendInviteDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUser, AuthUser } from './decorators/current-user.decorator';
import { InviteService, CreateInviteInput } from './invite.service';
import { OtpService } from './otp.service';
import { OtpPurpose, Role, User } from '../../prisma/generated/client';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly inviteService: InviteService,
    private readonly otpService: OtpService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account from an invitation link. This is a public endpoint.',
  })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
  })
  @ApiConflictResponse({
    description: 'Email or username already exists',
  })
  @ApiBadRequestResponse({
    description: 'Invalid input data or missing required fields',
  })
  async register(
    @Body()
    body: {
      email: string;
      name: string;
      username: string;
      password: string;
      role: string;
      tenantId?: string;
      userType?: string;
      status?: string;
    },
  ) {
    return this.authService.register(body);
  }

  @UseGuards(LocalAuthGuard)
  @Public()
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
  async login(
    @Request() req: { user: AuthenticatedUser },
  ): Promise<AuthResponseDto> {
    return this.authService.login(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({
    summary: 'Get current user profile',
    description:
      'Returns the full profile of the currently authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
  })
  async getProfile(@Request() req: { user: User }): Promise<any> {
    return this.authService.getProfile(req.user.id);
  }

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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

  // ─── Invite ────────────────────────────────────────────────────────────────

  @Post('invite')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Create and send an invite (Admin only)',
    description:
      'Creates an invite for a parent, teacher, or staff member and sends the link via SMS.',
  })
  @ApiResponse({ status: 201, description: 'Invite created and sent.' })
  @ApiConflictResponse({ description: 'Active invite or account already exists for this phone.' })
  async createInvite(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateInviteDto,
  ) {
    const input: CreateInviteInput = {
      tenantId: user.tenantId,
      phone: dto.phone,
      email: dto.email,
      name: dto.name,
      role: dto.role,
      referenceId: dto.referenceId,
      onboardingMode: dto.onboardingMode,
      createdBy: user.id,
    };
    return this.inviteService.create(input);
  }

  @Public()
  @Get('invite/validate')
  @ApiOperation({
    summary: 'Validate an invite token',
    description:
      'Returns invite details (role, onboarding mode, school info) for the given token.',
  })
  @ApiResponse({ status: 200, description: 'Invite is valid.' })
  @ApiBadRequestResponse({ description: 'Token missing or invalid.' })
  async validateInvite(@Query('token') token: string) {
    if (!token) throw new Error('token query param is required');
    return this.inviteService.validate(token);
  }

  @Public()
  @Post('invite/resend')
  @ApiOperation({
    summary: 'Resend an invite',
    description:
      'Generates a new invite token and resends the SMS. Old token is invalidated.',
  })
  @ApiResponse({ status: 200, description: 'Invite resent.' })
  async resendInvite(@Body() dto: ResendInviteDto) {
    return this.inviteService.resend(dto.token);
  }

  @Public()
  @Post('invite/complete')
  @ApiOperation({
    summary: 'Complete onboarding',
    description:
      'Creates the user account and links the profile. ' +
      'OTP mode: OTP must be verified first. Password mode: password is required.',
  })
  @ApiResponse({ status: 201, description: 'Account created. Returns auth tokens.', type: AuthResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failure or OTP not verified.' })
  @ApiConflictResponse({ description: 'Phone or email already registered.' })
  async completeOnboarding(@Body() dto: CompleteOnboardingDto): Promise<AuthResponseDto> {
    return this.authService.completeOnboarding(dto);
  }

  // ─── OTP ───────────────────────────────────────────────────────────────────

  @Public()
  @Post('otp/send')
  @ApiOperation({
    summary: 'Send an OTP',
    description:
      'Sends a 6-digit OTP via SMS. ' +
      'Include inviteToken for onboarding; omit for phone-based login.',
  })
  @ApiResponse({ status: 200, description: 'OTP sent.' })
  async sendOtp(@Body() dto: SendOtpDto) {
    const purpose = dto.inviteToken ? OtpPurpose.ONBOARDING : OtpPurpose.LOGIN;

    if (purpose === OtpPurpose.ONBOARDING) {
      // Validate invite before sending onboarding OTP
      const invite = await this.inviteService.getValidInvite(dto.inviteToken!);
      if (dto.phone !== invite.phone) {
        throw new Error('Phone number does not match the invitation.');
      }
      return this.otpService.send(dto.phone, purpose, invite.tenantId, dto.inviteToken);
    }

    return this.otpService.send(dto.phone, purpose);
  }

  @Public()
  @Post('otp/verify')
  @ApiOperation({
    summary: 'Verify an OTP',
    description:
      'Verifies the 6-digit code. ' +
      'For onboarding: returns { verified: true }. ' +
      'For login (no inviteToken): returns full auth tokens.',
  })
  @ApiResponse({ status: 200, description: 'OTP verified.' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const purpose = dto.inviteToken ? OtpPurpose.ONBOARDING : OtpPurpose.LOGIN;
    const result = await this.otpService.verify(dto.phone, purpose, dto.code, dto.inviteToken);

    // For login purpose, exchange the verified OTP for auth tokens immediately
    if (purpose === OtpPurpose.LOGIN) {
      return this.authService.loginWithVerifiedOtp(dto.phone);
    }

    return result;
  }

  // ─── Existing password-related ─────────────────────────────────────────────

  @Public()
  @Post('change-default-password')
  @ApiOperation({
    summary: 'Change default parent password',
    description:
      'Allows a parent still using the default password to set a new password before first use.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password updated successfully',
    schema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          example:
            'Password updated successfully. Please sign in with your new password.',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'Invalid payload or password does not meet requirements',
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
  })
  async changeDefaultPassword(
    @Body()
    body: {
      identifier: string;
      currentPassword: string;
      newPassword: string;
    },
  ): Promise<{ message: string }> {
    return this.authService.changeDefaultPassword(
      body.identifier,
      body.currentPassword,
      body.newPassword,
    );
  }
}
