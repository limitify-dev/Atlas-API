import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsOptional, IsString, IsNumber } from 'class-validator';

export class BulkUpdateInvoiceDto {
  @ApiPropertyOptional({ type: [String], description: 'List of invoice IDs to update' })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  invoiceIds: string[];

  @ApiPropertyOptional({ description: 'Amount in tenant currency' })
  @IsOptional()
  @IsNumber()
  amount?: number;

  @ApiPropertyOptional({ description: 'Currency code' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'New due date ISO string' })
  @IsOptional()
  @IsString()
  dueDate?: string;

  @ApiPropertyOptional({ description: 'Updated description' })
  @IsOptional()
  @IsString()
  description?: string;
}
