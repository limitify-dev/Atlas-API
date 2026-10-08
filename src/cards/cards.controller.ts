import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Res,
  StreamableFile,
  Query,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CardsService } from './cards.service';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, CardType } from '../../prisma/generated/client';
import { RequireModule } from '../common/module-access/require-module.decorator';

@ApiTags('cards')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@RequireModule('attendance')
@Controller('cards')
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  // Card management (create/edit/link/delete) is Studio-only now — see
  // StudioCardsController. Tenant admins/staff keep read-only access below
  // (list/statistics/template) so their own tools can still show status.

  @Post()
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new card' })
  create(@Request() req, @Body() createCardDto: CreateCardDto) {
    return this.cardsService.create(req.user.tenantId, createCardDto);
  }

  @Post('bulk-upload')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk upload cards from Excel/CSV' })
  @UseInterceptors(FileInterceptor('file'))
  async bulkUpload(@UploadedFile() file: Express.Multer.File, @Request() req) {
    return this.cardsService.processBulkUpload(file, req.user.tenantId);
  }

  @Get('bulk-upload-template')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Download card bulk upload template' })
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get card statistics' })
  getStatistics(@Request() req) {
    return this.cardsService.getStatistics(req.user.tenantId);
  }

  @Get('template')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Get the active card template for a card type (tenant default, falling back to the platform default) — used to render the e-Registration virtual-card preview',
  })
  getActiveTemplate(
    @Request() req,
    @Query('cardType') cardType: CardType = CardType.STUDENT,
  ) {
    return this.cardsService.findActiveTemplate(req.user.tenantId, cardType);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a card by id' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.cardsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update a card' })
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateCardDto: UpdateCardDto,
  ) {
    return this.cardsService.update(req.user.tenantId, id, updateCardDto);
  }

  @Delete(':id')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Delete a card' })
  remove(@Request() req, @Param('id') id: string) {
    return this.cardsService.remove(req.user.tenantId, id);
  }

  @Post('bulk-activate')
  @Roles(Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Bulk activate assigned cards' })
  bulkActivate(@Request() req, @Body() body: { cardIds: string[] }) {
    return this.cardsService.bulkActivate(req.user.tenantId, body.cardIds);
  }
}
