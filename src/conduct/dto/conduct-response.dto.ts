import { ApiProperty } from '@nestjs/swagger';
import {
  ConductType,
  IncidentStatus,
  PointTransactionType,
} from '../../../prisma/generated/client';

export class ConductStudentDto {
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

export class ConductRecordResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty({ enum: ConductType })
  type: ConductType;

  @ApiProperty()
  description: string;

  @ApiProperty()
  date: Date;

  @ApiProperty()
  reportedBy: string;

  @ApiProperty()
  severity: number;

  @ApiProperty({ required: false })
  pointsDeducted?: number;

  @ApiProperty({ enum: IncidentStatus })
  incidentStatus: IncidentStatus;

  @ApiProperty({ required: false })
  actionTaken?: string;

  @ApiProperty({ required: false })
  resolutionNotes?: string;

  @ApiProperty({ required: false })
  resolvedAt?: Date;

  @ApiProperty({ required: false })
  resolvedBy?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ type: () => ConductStudentDto })
  student: ConductStudentDto;

  @ApiProperty({ required: false })
  reporterName?: string;
}

export class ConductRecordListResponseDto {
  @ApiProperty({ type: [ConductRecordResponseDto] })
  data: ConductRecordResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class PointTransactionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: PointTransactionType })
  transactionType: PointTransactionType;

  @ApiProperty()
  pointsChange: number;

  @ApiProperty()
  pointsBefore: number;

  @ApiProperty()
  pointsAfter: number;

  @ApiProperty()
  reason: string;

  @ApiProperty()
  recordedBy: string;

  @ApiProperty()
  recordedAt: Date;

  @ApiProperty({ required: false })
  conductRecordId?: string;
}

export class StudentPointsResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  studentId: string;

  @ApiProperty()
  currentPoints: number;

  @ApiProperty({ required: false, nullable: true })
  lastUpdatedAt: Date | null;

  @ApiProperty({ type: () => ConductStudentDto })
  student: ConductStudentDto;

  @ApiProperty({ type: [PointTransactionDto], required: false })
  transactions?: PointTransactionDto[];

  @ApiProperty()
  category: string;
}

export class PointsListResponseDto {
  @ApiProperty({ type: [StudentPointsResponseDto] })
  data: StudentPointsResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

export class ConductStatsDto {
  @ApiProperty()
  totalRecords: number;

  @ApiProperty()
  activeIncidents: number;

  @ApiProperty()
  resolvedIncidents: number;

  @ApiProperty()
  totalWarnings: number;

  @ApiProperty()
  totalDetentions: number;

  @ApiProperty()
  totalSuspensions: number;

  @ApiProperty()
  totalPraises: number;

  @ApiProperty()
  averagePoints: number;

  @ApiProperty()
  studentsBelow50Points: number;

  @ApiProperty()
  studentsBelow75Points: number;
}

export class PointsDistributionDto {
  @ApiProperty()
  range: string;

  @ApiProperty()
  count: number;

  @ApiProperty()
  percentage: number;
}
