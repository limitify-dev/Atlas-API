import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FeedbackService } from '../studio/services/feedback.service';
import { CreateFeedbackDto } from '../studio/dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit feedback about the app' })
  async create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.feedbackService.create(user.tenantId, user.id, dto);
  }
}
