import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Role } from '../../prisma/generated/client';
import { PromotionsService } from './promotions.service';
import {
  CreatePromotionDto,
  PromotionFiltersDto,
  UpdatePromotionDto,
} from './dto';

@ApiTags('Promotions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('promotions')
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new promotion / cohort' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(user.tenantId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary:
      'List all promotions, optionally filtered by entryYear or isActive',
  })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filters: PromotionFiltersDto,
  ) {
    return this.promotionsService.findAll(user.tenantId, filters);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'Get a promotion with its classrooms and student counts',
  })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotionsService.findOne(user.tenantId, id);
  }

  @Get(':id/roster')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'Get classrooms with student counts for a promotion',
  })
  getRoster(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotionsService.getRoster(user.tenantId, id);
  }

  @Get(':id/roster/:sectionId')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER)
  @ApiOperation({
    summary: 'Get paginated students for a specific section within a promotion',
  })
  getSectionRoster(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('sectionId') sectionId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
  ) {
    return this.promotionsService.getSectionRoster(
      user.tenantId,
      id,
      sectionId,
      Number(page),
      Number(limit),
    );
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a promotion (name, description, isActive)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
  ) {
    return this.promotionsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Delete a promotion (only if no classrooms or students are assigned)',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.promotionsService.remove(user.tenantId, id);
  }
}
