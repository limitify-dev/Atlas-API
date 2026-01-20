import { ApiProperty } from '@nestjs/swagger';
import {
  PermissionType,
  PermissionStatus,
  PermissionRequestedBy,
} from '../../../prisma/generated/client';

export class PermissionStudentDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty({ required: false })
  photoUrl?: string;

  @ApiProperty({ required: false })
  grade?: {
    id: string;
    name: string;
    code: string;
  };

  @ApiProperty({ required: false })
  section?: {
    id: string;
    name: string;
  };
}

export class PermissionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty({ enum: PermissionType })
  permissionType: PermissionType;

  @ApiProperty()
  requestDate: Date;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty()
  reason: string;

  @ApiProperty()
  fromDate: Date;

  @ApiProperty()
  toDate: Date;

  @ApiProperty({ required: false })
  fromTime?: string;

  @ApiProperty({ required: false })
  toTime?: string;

  @ApiProperty({ required: false })
  schedule?: { days: number[] };

  @ApiProperty({ enum: PermissionStatus })
  status: PermissionStatus;

  @ApiProperty({ enum: PermissionRequestedBy })
  requestedBy: PermissionRequestedBy;

  @ApiProperty()
  requestedById: string;

  @ApiProperty({ required: false })
  approvedBy?: string;

  @ApiProperty({ required: false })
  approvedAt?: Date;

  @ApiProperty({ required: false })
  remarks?: string;

  @ApiProperty({ required: false })
  qrCode?: string;

  @ApiProperty()
  qrCodeUsed: boolean;

  @ApiProperty({ required: false })
  usedAt?: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => PermissionStudentDto })
  student: PermissionStudentDto;
}

export class PermissionListResponseDto {
  @ApiProperty({ type: [PermissionResponseDto] })
  data: PermissionResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class PermissionQrDataDto {
  @ApiProperty()
  permissionId: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty()
  studentName: string;

  @ApiProperty({ required: false })
  title?: string;

  @ApiProperty()
  reason: string;

  @ApiProperty()
  fromDate: string;

  @ApiProperty()
  toDate: string;

  @ApiProperty({ required: false })
  fromTime?: string;

  @ApiProperty({ required: false })
  toTime?: string;

  @ApiProperty()
  issuedAt: string;

  @ApiProperty()
  expiresAt: string;

  @ApiProperty({ required: false })
  grade?: string;

  @ApiProperty({ required: false })
  section?: string;

  @ApiProperty()
  tenantName: string;
}

export class PermissionStatsDto {
  @ApiProperty()
  total: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  approved: number;

  @ApiProperty()
  rejected: number;

  @ApiProperty()
  oneTime: number;

  @ApiProperty()
  recurring: number;

  @ApiProperty()
  used: number;

  @ApiProperty()
  unused: number;

  @ApiProperty()
  activeToday: number;
}
