import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateConductRecordDto } from './create-conduct-record.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdateConductRecordDto extends PartialType(CreateConductRecordDto) {}

export class ResolveConductRecordDto {
  @ApiProperty({
    description: 'Resolution notes',
    example: 'Issue resolved after meeting with student and parent',
  })
  @IsString()
  @IsOptional()
  resolutionNotes?: string;

  @ApiProperty({
    description: 'Final action taken',
    example: 'Parent notified, behavior contract signed',
    required: false,
  })
  @IsString()
  @IsOptional()
  actionTaken?: string;
}
