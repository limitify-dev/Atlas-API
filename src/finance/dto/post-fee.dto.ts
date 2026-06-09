import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum FeeScope {
  ALL = 'all',
  SECTION = 'section',
  GRADE = 'grade',
  STUDENTS = 'students',
}

export class PostFeeDto {
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
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amount must be a valid decimal with up to 2 decimal places',
  })
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

  @ApiPropertyOptional({
    example: 'tuition',
    description: 'tuition | transport | uniform | custom',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiProperty({
    enum: FeeScope,
    example: FeeScope.SECTION,
    description:
      'Target scope: all students, a section, a grade, or specific students',
  })
  @IsEnum(FeeScope)
  scope: FeeScope;

  @ApiPropertyOptional({ description: 'Required when scope = "section"' })
  @ValidateIf((o) => o.scope === FeeScope.SECTION)
  @IsUUID()
  sectionId?: string;

  @ApiPropertyOptional({ description: 'Required when scope = "grade"' })
  @ValidateIf((o) => o.scope === FeeScope.GRADE)
  @IsUUID()
  gradeId?: string;

  @ApiPropertyOptional({
    description: 'Required when scope = "students". List of student UUIDs.',
  })
  @ValidateIf((o) => o.scope === FeeScope.STUDENTS)
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('all', { each: true })
  studentIds?: string[];
}

export interface PostFeeResult {
  scope: FeeScope;
  targeted: number;
  created: number;
  failed: number;
  errors: { index: number; studentId: string; reason: string }[];
}
