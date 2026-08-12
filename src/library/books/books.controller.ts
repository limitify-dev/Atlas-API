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
} from '@nestjs/common';
import { BooksService } from './books.service';
import {
  CreateBookDto,
  CreateBookCopyDto,
  UpdateBookDto,
  GenerateCopiesDto,
} from './dto/create-book.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import {
  CurrentUser,
  AuthUser,
} from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';

const LIBRARY_READ_ROLES = [
  Role.ADMIN,
  Role.SUPER_ADMIN,
  Role.STAFF,
  Role.TEACHER,
] as const;
const LIBRARY_WRITE_ROLES = [Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('library/books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @Roles(...LIBRARY_WRITE_ROLES)
  create(@Body() createBookDto: CreateBookDto) {
    return this.booksService.create(createBookDto);
  }

  // System-wide maintenance operation (rewrites codes across every
  // tenant's copies) — not a tenant-scoped action, SUPER_ADMIN only.
  @Post('migrate')
  @Roles(Role.SUPER_ADMIN)
  migrate() {
    return this.booksService.migrateCodes();
  }

  @Get()
  @Roles(...LIBRARY_READ_ROLES)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.booksService.findAll({
      tenantId: user.tenantId,
      search,
      category,
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 10,
    });
  }

  @Get('code/:code')
  @Roles(...LIBRARY_READ_ROLES)
  findByCode(@CurrentUser() user: AuthUser, @Param('code') code: string) {
    return this.booksService.findByCode(user.tenantId, code);
  }

  @Get(':id')
  @Roles(...LIBRARY_READ_ROLES)
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.booksService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @Roles(...LIBRARY_WRITE_ROLES)
  update(
    @Param('id') id: string,
    @Body() updateBookDto: UpdateBookDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booksService.update(id, updateBookDto, user.tenantId);
  }

  @Delete(':id')
  @Roles(...LIBRARY_WRITE_ROLES)
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.booksService.remove(id, user.tenantId);
  }

  @Post(':id/copies')
  @Roles(...LIBRARY_WRITE_ROLES)
  addCopy(
    @Param('id') id: string,
    @Body() createCopyDto: CreateBookCopyDto,
    @CurrentUser() user: AuthUser,
  ) {
    // ensure body has bookId/tenantId set from the trusted route/token,
    // not whatever the client happened to send
    createCopyDto.bookId = id;
    createCopyDto.tenantId = user.tenantId;
    return this.booksService.addCopy(createCopyDto);
  }

  @Post(':id/generate-copies')
  @Roles(...LIBRARY_WRITE_ROLES)
  generateCopies(
    @Param('id') id: string,
    @Body() dto: GenerateCopiesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.booksService.generateCopies(id, {
      ...dto,
      tenantId: user.tenantId,
    });
  }

  @Delete('copies/:copyId')
  @Roles(...LIBRARY_WRITE_ROLES)
  removeCopy(@Param('copyId') copyId: string, @CurrentUser() user: AuthUser) {
    return this.booksService.removeCopy(copyId, user.tenantId);
  }
}
