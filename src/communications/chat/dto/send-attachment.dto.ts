import { IsString, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttachmentMetadata {
  @ApiProperty({ description: 'Public URL of the uploaded file' })
  @IsString()
  @IsNotEmpty()
  fileUrl: string;

  @ApiProperty({ description: 'Original file name' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNumber()
  @IsNotEmpty()
  fileSize: number;

  @ApiProperty({ description: 'MIME type of the file' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiPropertyOptional({ description: 'Thumbnail URL for images/videos' })
  @IsString()
  @IsOptional()
  thumbnailUrl?: string;

  @ApiPropertyOptional({ description: 'Duration in seconds for audio/video' })
  @IsNumber()
  @IsOptional()
  duration?: number;
}
