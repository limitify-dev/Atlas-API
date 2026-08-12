import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, ArrayMinSize, IsEnum, IsOptional, IsString } from 'class-validator';

export enum InvoiceReminderChannel {
  SMS = 'sms',
  EMAIL = 'email',
  BOTH = 'both',
}

export class SendInvoiceReminderDto {
  @ApiPropertyOptional({ description: 'Single invoice id' })
  @IsOptional()
  @IsString()
  invoiceId?: string;

  @ApiPropertyOptional({ type: [String], description: 'List of invoice ids' })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  invoiceIds?: string[];

  @ApiPropertyOptional({ enum: InvoiceReminderChannel, default: InvoiceReminderChannel.BOTH })
  @IsOptional()
  @IsEnum(InvoiceReminderChannel)
  channel?: InvoiceReminderChannel = InvoiceReminderChannel.BOTH;

  @ApiPropertyOptional({ description: 'Optional custom reminder message' })
  @IsOptional()
  @IsString()
  customMessage?: string;
}
