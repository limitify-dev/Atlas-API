import { Controller, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';
import { PushService } from './push.service';

class RegisterPushTokenDto {
  @ApiProperty({ description: 'Push notification token' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ enum: ['EXPO', 'FCM_WEB'], description: 'Token platform' })
  @IsEnum(['EXPO', 'FCM_WEB'])
  platform: 'EXPO' | 'FCM_WEB';

  @ApiPropertyOptional({ description: 'Device identifier' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

class UnregisterPushTokenDto {
  @ApiProperty({ description: 'Push notification token to unregister' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

@ApiTags('Push Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a push notification token' })
  async registerToken(
    @CurrentUser() user: AuthUser,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushService.registerToken(
      user.id,
      dto.token,
      dto.platform,
      dto.deviceId,
    );
  }

  @Delete('unregister')
  @ApiOperation({ summary: 'Unregister a push notification token' })
  async unregisterToken(@Body() dto: UnregisterPushTokenDto) {
    return this.pushService.unregisterToken(dto.token);
  }
}
