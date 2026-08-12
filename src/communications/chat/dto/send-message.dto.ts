import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AttachmentMetadata } from './send-attachment.dto';

export enum MessageTypeDto {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  FILE = 'FILE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
}

export class SendMessageDto {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional({ enum: MessageTypeDto, default: MessageTypeDto.TEXT })
  @IsOptional()
  @IsEnum(MessageTypeDto)
  type?: MessageTypeDto = MessageTypeDto.TEXT;

  @ApiPropertyOptional({ type: () => AttachmentMetadata })
  @IsOptional()
  attachment?: AttachmentMetadata;
}
