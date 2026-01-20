import { ApiProperty } from '@nestjs/swagger';
import {
  PermissionType,
  PermissionRequestedBy,
} from '../../../prisma/generated/client';
import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNotEmpty,
  IsArray,
  IsInt,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    description: 'Student ID to grant permission to',
    example: 'uuid-student-id',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Type of permission',
    enum: PermissionType,
    example: 'ONE_TIME',
  })
  @IsEnum(PermissionType)
  @IsNotEmpty()
  permissionType: PermissionType;

  @ApiProperty({
    description: 'Title for the permission (displayed on QR card)',
    example: 'Medical Appointment',
    required: false,
  })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    description: 'Reason for the permission',
    example: 'Doctor appointment at City Hospital',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiProperty({
    description: 'Start date of the permission',
    example: '2025-01-15',
  })
  @IsDateString()
  @IsNotEmpty()
  fromDate: string;

  @ApiProperty({
    description: 'End date of the permission',
    example: '2025-01-15',
  })
  @IsDateString()
  @IsNotEmpty()
  toDate: string;

  @ApiProperty({
    description: 'Start time for recurring permissions (HH:mm format)',
    example: '10:00',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'fromTime must be in HH:mm format',
  })
  fromTime?: string;

  @ApiProperty({
    description: 'End time for recurring permissions (HH:mm format)',
    example: '12:00',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'toTime must be in HH:mm format',
  })
  toTime?: string;

  @ApiProperty({
    description: 'Days of week for recurring permissions (0=Sunday, 1=Monday, etc.)',
    example: [1, 3, 5],
    required: false,
    type: [Number],
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  @IsOptional()
  scheduleDays?: number[];

  @ApiProperty({
    description: 'Who is requesting the permission',
    enum: PermissionRequestedBy,
    example: 'ADMIN',
    required: false,
  })
  @IsEnum(PermissionRequestedBy)
  @IsOptional()
  requestedBy?: PermissionRequestedBy;

  @ApiProperty({
    description: 'Additional remarks',
    example: 'Parent will pick up at the main gate',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
