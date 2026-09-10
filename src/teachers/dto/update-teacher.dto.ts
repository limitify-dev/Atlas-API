import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateTeacherDto } from './create-teacher.dto';

export class UpdateTeacherDto extends PartialType(CreateTeacherDto) {
  @ApiPropertyOptional({
    description:
      'Pass "true" (or an empty photoUrl) to remove the current profile photo',
    example: 'true',
  })
  @IsString()
  @IsOptional()
  removePhoto?: string;
}
