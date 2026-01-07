import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

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
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    {
      message: 'Date must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    },
  )
  date: string;

  @ApiProperty({
    description: 'Location where the card was scanned (e.g., entrance, classroom)',
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
    description: 'Date in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    example: '2024-01-15T00:00:00.000Z',
    format: 'date-time',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    {
      message: 'Date must be in ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)',
    },
  )
  date: string;

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
    description: 'Check-in time (HH:mm format)',
    example: '08:30',
    required: false,
  })
  @IsString()
  @IsOptional()
  checkInTime?: string;

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
