import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class CreateMomentDto {
  @ApiProperty({ example: 'Science Lab Day' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  caption?: string;

  @ApiProperty({ required: false, description: 'Section UUID' })
  @IsOptional()
  @IsString()
  sectionId?: string;

  @ApiProperty({ required: false, description: 'Human-readable class label e.g. "P5 A"' })
  @IsOptional()
  @IsString()
  classLabel?: string;

  @ApiProperty({ type: [String], description: 'Array of photo URLs (Supabase)' })
  @IsArray()
  @IsString({ each: true })
  photoUrls: string[];

  @ApiProperty({ required: false, enum: ['DRAFT', 'PUBLISHED'], default: 'PUBLISHED' })
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: string;
}

export class UpdateMomentDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  caption?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: string;
}

export class MomentFiltersDto {
  @IsOptional()
  @IsString()
  sectionId?: string;

  @IsOptional()
  @IsString()
  teacherId?: string;
}
