import { ArrayNotEmpty, IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BulkReviewSubmissionsDto {
  @ApiProperty({ type: [String], description: 'Payment submission IDs to review' })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  submissionIds: string[];

  @ApiProperty({ description: 'true = approve, false = reject' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({ description: 'Required when rejecting' })
  @IsString()
  @IsOptional()
  reviewNote?: string;
}
