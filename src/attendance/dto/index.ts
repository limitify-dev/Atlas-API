import {
  IsString,
  IsNotEmpty,
  IsOptional,
  Matches,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Standard date format for all attendance operations: ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)
 * Example: 2024-01-15T08:30:00.000Z
 */
export class AutoCheckInDto {
  @ApiProperty({
    description: 'Card number scanned by the external device',
    example: 'CARD-12345',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    description:
      'Date and time of check-in in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ). This is the timestamp from the external device.',
    example: '2024-01-15T08:30:00.000Z',
    format: 'date-time',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, {
    message: 'Date must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
  })
  date: string;

  @ApiProperty({
    description:
      'Location where the card was scanned (e.g., entrance, classroom)',
    example: 'entrance',
    required: false,
  })
  @IsString()
  @IsOptional()
  location?: string;
}

export class MarkAttendanceDto {
  @ApiProperty({
    description: 'Student ID',
    example: 'student-uuid',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description:
      'Date in ISO 8601 date format (YYYY-MM-DD) or datetime format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    example: '2024-01-15',
    format: 'date',
  })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiProperty({
    description: 'Attendance status',
    enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
    example: 'PRESENT',
  })
  @IsString()
  @IsNotEmpty()
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

  @ApiProperty({
    description: 'Whether this is a manual entry or automatic check-in',
    example: true,
  })
  isManual: boolean;

  @ApiProperty({
    description: 'Check-in time (HH:mm format) - only for automatic check-ins',
    example: '08:30',
    required: false,
  })
  @IsString()
  @IsOptional()
  checkInTime?: string;

  @ApiProperty({
    description:
      'Check-in datetime (ISO 8601 format) - only for automatic check-ins',
    example: '2024-01-15T08:30:00.000Z',
    required: false,
  })
  @IsString()
  @IsOptional()
  checkInDateTime?: string;

  @ApiProperty({
    description: 'Additional remarks',
    example: 'Arrived with parent',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiProperty({
    description: 'Tenant ID (optional, falls back to authenticated user)',
    required: false,
  })
  @IsString()
  @IsOptional()
  tenantId?: string;
}

/**
 * DTO for Edge device attendance record
 * Maps from Atlas-Edge format (card_id, timestamp) to backend format
 */
export class EdgeAttendanceRecordDto {
  @ApiProperty({
    description: 'Card ID/number from RFID reader',
    example: '123456789',
  })
  @IsString()
  @IsNotEmpty()
  card_id: string;

  @ApiProperty({
    description: 'Timestamp in ISO 8601 format',
    example: '2024-01-15T08:30:00.000Z',
  })
  @IsString()
  @IsNotEmpty()
  timestamp: string;

  @ApiProperty({
    description: 'Device ID that scanned the card',
    example: 'atlas-edge-001',
  })
  @IsString()
  @IsOptional()
  device_id?: string;

  @ApiProperty({
    description: 'Device name',
    example: 'Main Entrance',
  })
  @IsString()
  @IsOptional()
  device_name?: string;

  @ApiProperty({
    description: 'Location where the card was scanned',
    example: 'Main Entrance',
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    description: 'Whether this record has been synced (Edge internal)',
    example: false,
  })
  @IsOptional()
  synced?: boolean;
}

/**
 * DTO for batch attendance sync from Atlas-Edge
 */
export class BatchAttendanceDto {
  @ApiProperty({
    description: 'Array of attendance records to sync',
    type: [EdgeAttendanceRecordDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EdgeAttendanceRecordDto)
  records: EdgeAttendanceRecordDto[];
}

/**
 * Single record for bulk manual attendance marking
 */
export class BulkAttendanceRecordDto {
  @ApiProperty({
    description: 'Student ID',
    example: 'student-uuid',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Attendance status',
    enum: ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'],
    example: 'PRESENT',
  })
  @IsString()
  @IsNotEmpty()
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

  @ApiProperty({
    description: 'Additional remarks',
    example: 'Late due to traffic',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}

/**
 * DTO for bulk manual attendance marking
 */
export class BulkMarkAttendanceDto {
  @ApiProperty({
    description: 'Array of attendance records to mark',
    type: [BulkAttendanceRecordDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkAttendanceRecordDto)
  records: BulkAttendanceRecordDto[];
}
