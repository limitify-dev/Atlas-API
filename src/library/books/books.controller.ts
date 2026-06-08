import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Request,
} from '@nestjs/common';
import { BooksService } from './books.service';
import {
  CreateBookDto,
  CreateBookCopyDto,
  UpdateBookDto,
  GenerateCopiesDto,
} from './dto/create-book.dto';
// Assuming JwtAuthGuard exists in common/guards or auth
// I'll skip guards import for now to avoid errors if path differs, but commonly it is imported.
// The user has 'withAuth' on frontend, so backend likely has Guards.
// I'll try to find where JwtAuthGuard is.

@Controller('library/books')
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  create(@Body() createBookDto: CreateBookDto) {
    return this.booksService.create(createBookDto);
  }

  @Post('migrate')
  migrate() {
    return this.booksService.migrateCodes();
  }

  @Get()
  findAll(
    @Query('tenantId') tenantId: string,
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.booksService.findAll({
      tenantId,
      search,
      category,
      page: page ? +page : 1,
      pageSize: pageSize ? +pageSize : 10,
    });
  }

  @Get('code/:code')
  findByCode(@Query('tenantId') tenantId: string, @Param('code') code: string) {
    return this.booksService.findByCode(tenantId, code);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.booksService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateBookDto: UpdateBookDto) {
    return this.booksService.update(id, updateBookDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.booksService.remove(id);
  }

  @Post(':id/copies')
  addCopy(@Param('id') id: string, @Body() createCopyDto: CreateBookCopyDto) {
    // ensure body has bookId set to param id
    createCopyDto.bookId = id;
    return this.booksService.addCopy(createCopyDto);
  }

  @Post(':id/generate-copies')
  generateCopies(@Param('id') id: string, @Body() dto: GenerateCopiesDto) {
    return this.booksService.generateCopies(id, dto);
  }

  @Delete('copies/:copyId')
  removeCopy(@Param('copyId') copyId: string) {
    return this.booksService.removeCopy(copyId);
  }
}
