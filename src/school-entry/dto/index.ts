import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

const STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
type EntryStatus = (typeof STATUSES)[number];

export class ScanDto {
  @ApiProperty({ description: 'Card number scanned at the gate' })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({ description: 'Scan timestamp (ISO 8601)' })
  @IsISO8601()
  at: string;

  @ApiPropertyOptional({ description: 'Gate / reader location' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  deviceId?: string;
}

export class BatchScanRecordDto {
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @IsISO8601()
  at: string;

  @IsString()
  @IsOptional()
  location?: string;
}

export class BatchScanDto {
  @ApiProperty({ type: [BatchScanRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BatchScanRecordDto)
  records: BatchScanRecordDto[];
}

export class ManualEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({ description: 'Calendar day (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  status: EntryStatus;

  @ApiPropertyOptional({ description: 'Check-in time (ISO 8601)' })
  @IsISO8601()
  @IsOptional()
  checkInAt?: string;

  @ApiPropertyOptional({ description: 'Check-out time (ISO 8601)' })
  @IsISO8601()
  @IsOptional()
  checkOutAt?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BulkManualEntryRecordDto {
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @IsIn(STATUSES as unknown as string[])
  status: EntryStatus;

  @IsString()
  @IsOptional()
  remarks?: string;
}

export class BulkManualEntryDto {
  @ApiProperty({ description: 'Calendar day (YYYY-MM-DD)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({ type: [BulkManualEntryRecordDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkManualEntryRecordDto)
  records: BulkManualEntryRecordDto[];
}

export class SchoolEntryQueryDto {
  @IsString()
  @IsOptional()
  from?: string;

  @IsString()
  @IsOptional()
  to?: string;

  @IsEnum({ PRESENT: 'PRESENT', ABSENT: 'ABSENT', LATE: 'LATE', EXCUSED: 'EXCUSED' })
  @IsOptional()
  status?: EntryStatus;

  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;
}
