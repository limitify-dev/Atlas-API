import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, AuthUser } from '../../auth/decorators/current-user.decorator';
import { Role } from '../../../prisma/generated/client';
import { ImportService, InvoiceImportPreview } from './import.service';

@ApiTags('Finance — Import')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance/import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('preview')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiOperation({
    summary: 'Parse and validate a .xlsx/.csv invoice import file (dry-run)',
    description: 'Returns a preview of valid rows and validation errors. No records are created.',
  })
  preview(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.importService.parseAndPreview(user.tenantId, file);
  }

  @Post('commit')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Commit a previously-validated preview and create all invoices',
    description: 'Rejects the request if any errors remain in the preview.',
  })
  commit(
    @CurrentUser() user: AuthUser,
    @Body() preview: InvoiceImportPreview,
  ) {
    return this.importService.commitImport(user.tenantId, preview, user.id);
  }
}
