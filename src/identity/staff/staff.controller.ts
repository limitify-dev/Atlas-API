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
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { StaffService } from './staff.service';
import {
  CreateStaffDto,
  RegisterStaffDto,
  StaffFiltersDto,
  UpdateStaffDto,
} from './dto';

@ApiTags('Identity — Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post('register')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary:
      'Register a new staff member (creates user + staff profile + sends invite email)',
  })
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterStaffDto) {
    return this.staffService.register(user.tenantId, dto);
  }

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a staff profile for an existing user' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateStaffDto) {
    return this.staffService.create(user.tenantId, dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'List all staff members' })
  findAll(@CurrentUser() user: AuthUser, @Query() filters: StaffFiltersDto) {
    return this.staffService.findAll(user.tenantId, filters);
  }

  @Get('roles')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List distinct staff roles used in this tenant' })
  getRoles(@CurrentUser() user: AuthUser) {
    return this.staffService.getRoles(user.tenantId);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a single staff member' })
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a staff member' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.staffService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Remove a staff profile (resets user role to USER)',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.staffService.remove(user.tenantId, id);
  }
}
