import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

/**
 * Response when generating a QR code token for a student card
 */
export class StudentCardQrResponseDto {
  @ApiProperty({
    description: 'JWT token to encode in the QR code',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  token: string;

  @ApiProperty({
    description: 'Student ID for display purposes',
    example: 'ST001',
  })
  studentId: string;

  @ApiProperty({
    description: 'Student full name for display purposes',
    example: 'John Doe',
  })
  studentName: string;
}

/**
 * Request body when scanning a student card QR code
 */
export class ScanStudentCardDto {
  @ApiProperty({
    description: 'JWT token from the scanned QR code',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;
}

/**
 * Permission summary included in student card scan response
 */
export class PermissionSummaryDto {
  @ApiProperty({ example: 'uuid-string' })
  id: string;

  @ApiProperty({ example: 'Medical Appointment' })
  title: string | null;

  @ApiProperty({ example: 'Doctor appointment' })
  reason: string;

  @ApiProperty({ example: 'ONE_TIME' })
  permissionType: string;

  @ApiProperty({ example: '2024-01-15' })
  fromDate: Date;

  @ApiProperty({ example: '2024-01-15' })
  toDate: Date;

  @ApiProperty({ example: '09:00', required: false })
  fromTime: string | null;

  @ApiProperty({ example: '12:00', required: false })
  toTime: string | null;

  @ApiProperty({ example: 'APPROVED' })
  status: string;
}

/**
 * Response when scanning a student card QR code
 * Contains student info and their active permissions
 */
export class StudentCardInfoDto {
  @ApiProperty({
    description: 'Student information',
  })
  student: {
    id: string;
    studentId: string;
    firstName: string;
    lastName: string;
    fullName: string;
    photoUrl: string | null;
    grade: {
      id: string;
      name: string;
    };
    section: {
      id: string;
      name: string;
    };
    parents: Array<{
      id: string;
      firstName: string;
      lastName: string;
      fullName: string;
      email: string;
      phone: string | null;
      relationship: string | null;
      occupation: string | null;
      isPrimary: boolean;
    }>;
    card?: {
      id: string;
      cardNumber: string;
      status: string;
    } | null;
  };

  @ApiProperty({
    description: 'List of currently active permissions',
    type: [PermissionSummaryDto],
  })
  activePermissions: PermissionSummaryDto[];

  @ApiProperty({
    description: 'Whether the student has any active permission right now',
    example: true,
  })
  hasActivePermission: boolean;
}
