import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsArray, IsBoolean } from 'class-validator';

export class CreateCombinationDto {
  @ApiProperty({
    description: 'Display name of the combination',
    example: 'Math-Physics-Geography-Economics',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Short code for the combination',
    example: 'MPGE',
  })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({
    description: 'Description of the combination',
    example: 'Science combination for Advanced Level',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Array of subject IDs in this combination',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
    type: [String],
  })
  @IsArray()
  @IsNotEmpty()
  subjectIds: string[];

  @ApiProperty({
    description: 'Whether the combination is active',
    example: true,
    required: false,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
