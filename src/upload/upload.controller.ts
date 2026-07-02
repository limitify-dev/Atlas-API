import {
  Controller,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Request,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SupabaseService } from '../common/supabase/supabase.service';
import { extname } from 'path';

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('upload')
export class UploadController {
  constructor(private readonly supabase: SupabaseService) {}

  @Post('images')
  @ApiOperation({ summary: 'Upload one or more images; returns public URLs' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: { fileSize: MAX_FILE_SIZE },
      fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
    }),
  )
  async uploadImages(
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ): Promise<{ urls: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    const tenantId: string = req.user.tenantId ?? 'global';
    const urls: string[] = [];

    for (const file of files) {
      const ext = extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
      const filePath = `${tenantId}/moments/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

      const { error } = await this.supabase.client.storage
        .from('atlas-moments')
        .upload(filePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
          cacheControl: '31536000',
        });

      if (error) {
        throw new BadRequestException(`Upload failed: ${error.message}`);
      }

      const { data } = this.supabase.client.storage
        .from('atlas-moments')
        .getPublicUrl(filePath);

      urls.push(data.publicUrl);
    }

    return { urls };
  }
}
