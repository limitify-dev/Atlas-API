import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ForbiddenException,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../auth/decorators/current-user.decorator';
import { Role } from '../../prisma/generated/client';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new user (Admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of all users' })
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('tenantId') tenantId?: string,
    @Query('role') role?: Role,
    @Query('noTenant') noTenant?: boolean,
    @Query('search') search?: string,
    @Query('userType') userType?: string,
  ) {
    // Non-super-admins can only ever list their own tenant's users —
    // TenantGuard rejects a *mismatched* supplied tenantId, but an
    // *omitted* one would otherwise fall through to every tenant's users.
    const effectiveTenantId =
      user.role === Role.SUPER_ADMIN ? tenantId : user.tenantId;
    return this.usersService.findAll(
      effectiveTenantId,
      role,
      noTenant,
      search,
      userType,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    // Users can only view their own profile unless they're admin
    if (
      user.userId !== id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.usersService.findOne(
      id,
      user.role === Role.SUPER_ADMIN ? null : user.tenantId,
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
    @CurrentUser() user: AuthUser,
  ) {
    // Users can only update their own profile unless they're admin
    if (
      user.userId !== id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.update(
      id,
      updateUserDto,
      user.role === Role.SUPER_ADMIN ? null : user.tenantId,
    );
  }

  @Patch(':id/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Update user avatar' })
  @ApiResponse({ status: 200, description: 'Avatar updated successfully' })
  updateAvatar(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 5 }), // 5MB
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg)' }),
        ],
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    // Users can only update their own profile unless they're admin
    if (
      user.userId !== id &&
      user.role !== Role.ADMIN &&
      user.role !== Role.SUPER_ADMIN
    ) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.usersService.updateAvatar(
      id,
      file,
      user.role === Role.SUPER_ADMIN ? null : user.tenantId,
    );
  }

  @Delete(':id')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete user by ID (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin access required',
  })
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.usersService.remove(
      id,
      user.role === Role.SUPER_ADMIN ? null : user.tenantId,
    );
  }
}
