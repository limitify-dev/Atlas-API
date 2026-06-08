import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../common/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { AnnouncementsService } from './announcements.service';
import {
  AnnouncementFiltersDto,
  CreateAnnouncementDto,
  UpdateAnnouncementDto,
} from './dto';

@ApiTags('Announcements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new announcement' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.announcementsService.create(user.tenantId, user.id, dto);
  }

  @Post('upload-image')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload announcement banner image' })
  async uploadImage(
    @CurrentUser() user: AuthUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 1024 * 1024 * 8 }),
          new FileTypeValidator({ fileType: '.(png|jpeg|jpg|webp)' }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.announcementsService.uploadImage(user.tenantId, user.id, file);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all announcements (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'audience', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, type: String })
  async findAll(
    @CurrentUser() user: AuthUser,
    @Query() filters: AnnouncementFiltersDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.announcementsService.findAll(
      user.tenantId,
      filters,
      +page,
      +limit,
    );
  }

  @Get('my')
  @ApiOperation({ summary: 'Get announcements for current user' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'priority', required: false, type: String })
  async findForUser(
    @CurrentUser() user: AuthUser,
    @Query() filters: AnnouncementFiltersDto,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.announcementsService.findForUser(
      user.id,
      user.tenantId,
      user.role,
      filters,
      +page,
      +limit,
    );
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get announcement statistics' })
  async getStats(@CurrentUser() user: AuthUser) {
    return this.announcementsService.getStats(user.tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single announcement' })
  async findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcementsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update an announcement' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateAnnouncementDto,
  ) {
    return this.announcementsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete an announcement' })
  async delete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcementsService.delete(id, user.tenantId);
  }

  @Patch(':id/pin')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN, Role.DOS, Role.DM, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Toggle pin status of an announcement' })
  async togglePin(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isPinned?: boolean },
  ) {
    return this.announcementsService.setPin(id, user.tenantId, body?.isPinned);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark an announcement as read' })
  async markAsRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.announcementsService.markAsRead(id, user.id);
  }
}
