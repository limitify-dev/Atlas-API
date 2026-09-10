import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateSubjectDto } from './create-subject.dto';

export class BulkCreateSubjectsDto {
  @ApiProperty({ type: [CreateSubjectDto], description: 'Subjects to create' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateSubjectDto)
  subjects: CreateSubjectDto[];
}
