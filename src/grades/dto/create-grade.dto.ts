import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';
import { SchoolLevel, EducationLevel } from '../../../prisma/generated/enums';

export class CreateGradeDto {
  @ApiProperty({
    description: 'Name of the grade',
    example: 'Senior 1',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Short code for the grade',
    example: 'S1',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Level of the grade (e.g., 1 for S1, 4 for S4)',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  level: number;

  @ApiProperty({
    description: 'School level',
    enum: SchoolLevel,
    example: SchoolLevel.SENIOR,
  })
  @IsEnum(SchoolLevel)
  @IsNotEmpty()
  schoolLevel: SchoolLevel;

  @ApiProperty({
    description: 'Education level',
    enum: EducationLevel,
    example: EducationLevel.ORDINARY,
  })
  @IsEnum(EducationLevel)
  @IsNotEmpty()
  educationLevel: EducationLevel;

  @ApiProperty({
    description: 'Description of the grade',
    example: 'First year of secondary school',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
