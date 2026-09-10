import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Request,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SupabaseService } from '../../common/supabase/supabase.service';
import { RequireModule } from '../../common/module-access/require-module.decorator';
import { ChatService } from './chat.service';
import { extname } from 'path';

// Max file sizes
const SIZES = {
  IMAGE: 10 * 1024 * 1024,  // 10 MB
  FILE: 25 * 1024 * 1024,   // 25 MB
  AUDIO: 16 * 1024 * 1024,  // 16 MB
  VIDEO: 64 * 1024 * 1024,  // 64 MB
};

const ALLOWED_MIME = {
  IMAGE: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic'],
  FILE: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],
  AUDIO: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/aac'],
  VIDEO: ['video/mp4', 'video/quicktime', 'video/webm'],
};

@ApiTags('Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@RequireModule('connect')
@Controller('chat/conversations/:id/attachments')
export class ChatUploadController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly chatService: ChatService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Upload a file attachment for a chat message' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: Math.max(...Object.values(SIZES)) }, // Allow up to video size, handle specific size in logic
    }),
  )
  async uploadAttachment(
    @Param('id') conversationId: string,
    @UploadedFile() file: Express.Multer.File,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const tenantId: string = req.user.tenantId ?? 'global';
    const userId: string = req.user.id;

    // Verify user is in conversation
    const isParticipant = await this.chatService.getConversationParticipantIds(conversationId, userId).then(ids => {
        // Since getConversationParticipantIds excludes the requesting user, we should check if they can access it by trying to get the conversation
        return this.chatService.getConversationById(conversationId, userId, req.user.tenantId, req.user.role).then(() => true).catch(() => false);
    });

    if (!isParticipant) {
      throw new BadRequestException('You do not have access to upload files to this conversation');
    }

    // Determine type
    let fileType: 'IMAGE' | 'FILE' | 'AUDIO' | 'VIDEO' | null = null;
    let maxSize = 0;

    if (ALLOWED_MIME.IMAGE.includes(file.mimetype)) {
      fileType = 'IMAGE';
      maxSize = SIZES.IMAGE;
    } else if (ALLOWED_MIME.FILE.includes(file.mimetype)) {
      fileType = 'FILE';
      maxSize = SIZES.FILE;
    } else if (ALLOWED_MIME.AUDIO.includes(file.mimetype)) {
      fileType = 'AUDIO';
      maxSize = SIZES.AUDIO;
    } else if (ALLOWED_MIME.VIDEO.includes(file.mimetype)) {
      fileType = 'VIDEO';
      maxSize = SIZES.VIDEO;
    }

    if (!fileType) {
      throw new BadRequestException(`Unsupported file type: ${file.mimetype}`);
    }

    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds the limit for ${fileType} (${maxSize / 1024 / 1024}MB)`);
    }

    const ext = extname(file.originalname) || `.${file.mimetype.split('/')[1]}`;
    const filePath = `${tenantId}/${conversationId}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

    const { error } = await this.supabase.client.storage
      .from('atlas-chat')
      .upload(filePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
        cacheControl: '31536000',
      });

    if (error) {
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    const { data } = this.supabase.client.storage
      .from('atlas-chat')
      .getPublicUrl(filePath);

    return {
      fileUrl: data.publicUrl,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      type: fileType,
    };
  }
}
