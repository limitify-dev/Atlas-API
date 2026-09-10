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
import { Role } from '../../prisma/generated/client';
import { CurrentUser, AuthUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequireModule } from '../common/module-access/require-module.decorator';
import { MomentsService } from './moments.service';
import { CreateMomentDto, MomentFiltersDto, UpdateMomentDto } from './dto';

@ApiTags('Moments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('connect')
@Controller('moments')
export class MomentsController {
  constructor(private readonly momentsService: MomentsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a class moment (admin post)' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateMomentDto) {
    return this.momentsService.create(user.tenantId, user.id, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'List moments (optionally by section or teacher)' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() filters: MomentFiltersDto,
  ) {
    return this.momentsService.findAll(user.tenantId, filters, user.id);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'Get a single moment' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.momentsService.findOne(user.tenantId, id, user.id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a moment (admin)' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateMomentDto,
  ) {
    return this.momentsService.update(user.tenantId, user.id, id, dto, user.role);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a moment' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.momentsService.remove(user.tenantId, user.id, id);
  }

  @Post(':id/like')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF, Role.TEACHER, Role.PARENT)
  @ApiOperation({ summary: 'Toggle like on a moment' })
  toggleLike(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.momentsService.toggleLike(user.tenantId, user.id, id);
  }
}
