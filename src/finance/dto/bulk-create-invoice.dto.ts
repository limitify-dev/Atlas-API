import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateInvoiceDto } from './create-invoice.dto';

export class BulkCreateInvoiceDto {
  @ApiProperty({ type: [CreateInvoiceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceDto)
  invoices: CreateInvoiceDto[];
}

export interface BulkCreateResult {
  created: number;
  failed: number;
  errors: { index: number; studentId: string; reason: string }[];
}
