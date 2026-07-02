import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Parents Meeting' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2026-06-20T09:00:00.000Z' })
  @IsDateString()
  eventDate: string;

  @ApiProperty({ required: false, description: 'End date/time for multi-day events' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiProperty({ required: false, example: '8:00 AM – 3:00 PM' })
  @IsOptional()
  @IsString()
  time?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  organizer?: string;

  @ApiProperty({
    required: false,
    enum: ['Academic', 'Sports', 'Cultural', 'Admin'],
    default: 'Academic',
  })
  @IsOptional()
  @IsIn(['Academic', 'Sports', 'Cultural', 'Admin'])
  category?: string;

  @ApiProperty({ required: false, example: 'All Grades' })
  @IsOptional()
  @IsString()
  gradeTarget?: string;

  @ApiProperty({
    required: false,
    enum: ['ALL', 'PARENTS', 'STAFF', 'TEACHERS'],
    default: 'ALL',
  })
  @IsOptional()
  @IsIn(['ALL', 'PARENTS', 'STAFF', 'TEACHERS'])
  audience?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  eventDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  time?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  organizer?: string;

  @IsOptional()
  @IsIn(['Academic', 'Sports', 'Cultural', 'Admin'])
  category?: string;

  @IsOptional()
  @IsString()
  gradeTarget?: string;

  @IsOptional()
  @IsIn(['ALL', 'PARENTS', 'STAFF', 'TEACHERS'])
  audience?: string;
}

export class EventFiltersDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['Academic', 'Sports', 'Cultural', 'Admin'])
  category?: string;
}
