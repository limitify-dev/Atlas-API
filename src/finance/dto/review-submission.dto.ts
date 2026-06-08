import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewSubmissionDto {
  @ApiProperty({ description: 'true = approve, false = reject' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Required when rejecting' })
  @IsString()
  @IsOptional()
  reviewNote?: string;
}
