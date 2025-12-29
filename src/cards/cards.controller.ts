import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Request, UseInterceptors, UploadedFile, Res, StreamableFile, HttpStatus, Query } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new card' })
  create(@Request() req, @Body() createCardDto: CreateCardDto) {
    return this.cardsService.create(req.user.tenantId, createCardDto);
  }

  @Post('bulk-upload')
  @ApiOperation({ summary: 'Bulk upload cards from Excel/CSV' })
  @UseInterceptors(FileInterceptor('file'))
  async bulkUpload(
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    return this.cardsService.processBulkUpload(file, req.user.tenantId);
  }

  @Get('bulk-upload-template')
  @ApiOperation({ summary: 'Download card bulk upload template' })
  async getBulkUploadTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = await this.cardsService.getBulkUploadTemplate();

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="card_import_template.xlsx"',
    });

    return new StreamableFile(buffer as any);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get card statistics' })
  getStatistics(@Request() req) {
    return this.cardsService.getStatistics(req.user.tenantId);
  }

  @Get()
  @ApiOperation({ summary: 'Get all cards' })
  findAll(
    @Request() req,
    @Query('search') search?: string,
    @Query('unassigned') unassigned?: string,
  ) {
    return this.cardsService.findAll(req.user.tenantId, { 
      search,
      unassigned: unassigned === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a card by id' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.cardsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a card' })
  update(@Request() req, @Param('id') id: string, @Body() updateCardDto: UpdateCardDto) {
    return this.cardsService.update(req.user.tenantId, id, updateCardDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a card' })
  remove(@Request() req, @Param('id') id: string) {
    return this.cardsService.remove(req.user.tenantId, id);
  }

  @Post('bulk-activate')
  @ApiOperation({ summary: 'Bulk activate assigned cards' })
  bulkActivate(@Request() req, @Body() body: { cardIds: string[] }) {
    return this.cardsService.bulkActivate(req.user.tenantId, body.cardIds);
  }
}
