import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/swagger';
import { ConsultationStatus } from '../../../prisma/generated/client';

export class ListAcademicsQueryDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  studentId?: string;

  @IsOptional()
  @IsString()
  gradeId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class CreateAcademicExamDto {
  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsDateString()
  examDate: string;

  @IsString()
  gradeId: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpdateAcademicExamDto extends PartialType(CreateAcademicExamDto) {}

export class CreateAssignmentDto {
  @IsOptional()
  @IsString()
  courseId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsString()
  gradeId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  maxScore?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

  @IsOptional()
  @IsIn(['HOMEWORK', 'CLASSWORK', 'QUIZ', 'TEST', 'PROJECT', 'EXAM'])
  type?: 'HOMEWORK' | 'CLASSWORK' | 'QUIZ' | 'TEST' | 'PROJECT' | 'EXAM';
}

export class UpdateAssignmentDto extends PartialType(CreateAssignmentDto) {}

export class CreateAcademicCourseDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsString()
  sectionId: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpdateAcademicCourseDto {
  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  subjectId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  term?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpsertTeacherAlignmentDto {
  @IsArray()
  @IsString({ each: true })
  sectionIds: string[];

  @IsArray()
  @IsString({ each: true })
  subjectIds: string[];
}

export class AssignmentResultItemDto {
  @IsString()
  studentId: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsIn(['PENDING', 'GRADED', 'MISSING'])
  status?: 'PENDING' | 'GRADED' | 'MISSING';
}

export class UpsertAssignmentResultsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentResultItemDto)
  items: AssignmentResultItemDto[];
}

export class CreateReportCardDto {
  @IsString()
  studentId: string;

  @IsString()
  term: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  overallScore?: number;

  @IsOptional()
  @IsString()
  grade?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  metadata?: JSON;

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class UpdateReportCardDto extends PartialType(CreateReportCardDto) {}

export class CreateConsultationBookingDto {
  @IsDateString()
  consultationDate: string;

  @IsString()
  startTime: string;

  @IsString()
  endTime: string;

  @IsString()
  studentId: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  announcementId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
  status?: ConsultationStatus;
}

export class UpdateConsultationBookingDto extends PartialType(CreateConsultationBookingDto) {}

export class ConsultationTeacherOverrideDto {
  @IsString()
  teacherId: string;

  @IsOptional()
  @IsString()
  location?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  durationMinutes?: number | null;
}

export class UpsertConsultationConfigDto {
  @IsDateString()
  consultationDate: string;

  @IsString()
  startTime: string;

  /**
   * The day's hard cutoff — the schedule generator refuses to save a config
   * whose selected sections + duration would run any teacher past this time
   * (see AcademicsService.assertConsultationCapacity).
   */
  @IsString()
  endTime: string;

  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(120)
  defaultDurationMinutes?: number;

  @IsOptional()
  @IsString()
  defaultLocation?: string;

  @IsOptional()
  @IsString()
  breakStartTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  breakDurationMinutes?: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sectionIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConsultationTeacherOverrideDto)
  teacherOverrides?: ConsultationTeacherOverrideDto[];

  @IsOptional()
  @IsBoolean()
  makeActive?: boolean;
}
