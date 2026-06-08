import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceDto {
  @ApiProperty({ example: 'Term 1 Tuition Fee' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: '250.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amount must be a valid decimal with up to 2 decimal places' })
  amount: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiProperty({ example: '2025-03-31' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ example: '2025-T1' })
  @IsString()
  @IsOptional()
  term?: string;

  @ApiPropertyOptional({ example: 'tuition', description: 'tuition | transport | uniform | custom' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty()
  @IsUUID()
  studentId: string;
}
