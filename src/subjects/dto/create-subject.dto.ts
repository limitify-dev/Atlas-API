import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateSubjectDto {
  @ApiProperty({ description: 'Name of the subject', example: 'Mathematics' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Short code for the subject', example: 'MATH' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Grade the subject belongs to' })
  @IsUUID()
  @IsNotEmpty()
  gradeId: string;

  @ApiProperty({ description: 'Optional description', required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
