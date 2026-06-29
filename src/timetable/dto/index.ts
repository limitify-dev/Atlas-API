import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DayOfWeek } from '../../../prisma/generated/enums';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreatePeriodDto {
  @ApiProperty({ example: 'Period 1' })
  @IsString()
  @IsNotEmpty()
  label: string;

  @ApiProperty({ example: '08:15' })
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:MM (24h) format' })
  startTime: string;

  @ApiProperty({ example: '08:55' })
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:MM (24h) format' })
  endTime: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  orderIndex: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

export class UpdatePeriodDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  label?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'startTime must be in HH:MM (24h) format' })
  startTime?: string;

  @IsOptional()
  @Matches(TIME_REGEX, { message: 'endTime must be in HH:MM (24h) format' })
  endTime?: string;

  @IsOptional()
  @IsInt()
  orderIndex?: number;

  @IsOptional()
  @IsBoolean()
  isBreak?: boolean;
}

/** Replace the tenant's entire set of periods in one call (admin editor). */
export class BulkSetPeriodsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePeriodDto)
  periods: CreatePeriodDto[];
}

export class CreateEntryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  periodId: string;

  @ApiProperty({ enum: DayOfWeek })
  @IsEnum(DayOfWeek)
  dayOfWeek: DayOfWeek;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  teacherId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  room?: string;
}

export class UpdateEntryDto {
  @IsOptional()
  @IsString()
  periodId?: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;

  @IsOptional()
  @IsString()
  subjectId?: string | null;

  @IsOptional()
  @IsString()
  teacherId?: string | null;

  @IsOptional()
  @IsString()
  room?: string | null;
}

export class EntryFiltersDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;

  @IsOptional()
  @IsEnum(DayOfWeek)
  dayOfWeek?: DayOfWeek;
}

export { DayOfWeek };
