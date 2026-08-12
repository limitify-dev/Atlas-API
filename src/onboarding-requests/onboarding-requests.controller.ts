import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { StudioGuard } from '../studio/guards/studio.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { OnboardingRequestsService } from './onboarding-requests.service';
import { CreateOnboardingRequestDto, UpdateOnboardingRequestDto } from './dto';
import { OnboardingRequestStatus } from '../../prisma/generated/client';

// Same abuse-prone-endpoint limit used for auth routes — this is a public,
// unauthenticated POST, so it needs the same protection.
const PUBLIC_FORM_THROTTLE = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('Onboarding Requests')
@Controller('onboarding-requests')
export class OnboardingRequestsController {
  constructor(private readonly service: OnboardingRequestsService) {}

  @Public()
  @Throttle(PUBLIC_FORM_THROTTLE)
  @Post()
  @ApiOperation({
    summary: 'Submit a request to onboard (public get-started/demo/enroll form)',
  })
  create(@Body() dto: CreateOnboardingRequestDto) {
    return this.service.create(dto);
  }

  @UseGuards(StudioGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'List onboarding requests (Studio only)' })
  findAll(@Query('status') status?: OnboardingRequestStatus) {
    return this.service.findAll(status);
  }

  @UseGuards(StudioGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update an onboarding request\'s status/notes (Studio only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateOnboardingRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, user.id);
  }
}
