import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StudioGuard } from '../studio/guards/studio.guard';
import { CardType } from '../../prisma/generated/client';

/**
 * Card management, operated by a Studio super-admin on behalf of a specific
 * tenant (the tenant themselves only gets read-only access via
 * CardsController). Mirrors CardsController route-for-route, just taking
 * tenantId from the URL instead of the caller's own session.
 */
@ApiTags('studio-cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, StudioGuard)
@Controller('studio/tenants/:tenantId/cards')
export class StudioCardsController {
  constructor(private readonly cardsService: CardsService) {}

  @Post()
  @ApiOperation({ summary: '[Studio] Create a new card for a tenant' })
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateCardDto) {
    return this.cardsService.create(tenantId, dto);
  }

  @Post('bulk-upload')
  @ApiOperation({ summary: '[Studio] Bulk upload cards from Excel/CSV' })
  @UseInterceptors(FileInterceptor('file'))
  async bulkUpload(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.cardsService.processBulkUpload(file, tenantId);
  }

  @Get('bulk-upload-template')
  @ApiOperation({ summary: '[Studio] Download card bulk upload template' })
  getBulkUploadTemplate(@Res({ passthrough: true }) res: Response) {
    const buffer = this.cardsService.getBulkUploadTemplate();
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="card_import_template.xlsx"',
    });
    return new StreamableFile(buffer as any);
  }

  @Get('statistics')
  @ApiOperation({ summary: '[Studio] Get card statistics for a tenant' })
  getStatistics(@Param('tenantId') tenantId: string) {
    return this.cardsService.getStatistics(tenantId);
  }

  @Get('template')
  @ApiOperation({
    summary: '[Studio] Get the active card template for a card type',
  })
  getActiveTemplate(
    @Param('tenantId') tenantId: string,
    @Query('cardType') cardType: CardType = CardType.STUDENT,
  ) {
    return this.cardsService.findActiveTemplate(tenantId, cardType);
  }

  @Get()
  @ApiOperation({ summary: '[Studio] Get all cards for a tenant' })
  findAll(
    @Param('tenantId') tenantId: string,
    @Query('search') search?: string,
    @Query('unassigned') unassigned?: string,
  ) {
    return this.cardsService.findAll(tenantId, {
      search,
      unassigned: unassigned === 'true',
    });
  }

  @Get(':id')
  @ApiOperation({ summary: '[Studio] Get a card by id' })
  findOne(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.cardsService.findOne(tenantId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '[Studio] Update a card' })
  update(
    @Param('tenantId') tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateCardDto,
  ) {
    return this.cardsService.update(tenantId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '[Studio] Delete a card' })
  remove(@Param('tenantId') tenantId: string, @Param('id') id: string) {
    return this.cardsService.remove(tenantId, id);
  }

  @Post('bulk-activate')
  @ApiOperation({ summary: '[Studio] Bulk activate assigned cards' })
  bulkActivate(
    @Param('tenantId') tenantId: string,
    @Body() body: { cardIds: string[] },
  ) {
    return this.cardsService.bulkActivate(tenantId, body.cardIds);
  }
}
