import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { CreateStudentDto } from './create-student.dto';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  // All fields from CreateStudentDto are now optional
  // Students don't have user accounts, so no status field needed

  @ApiPropertyOptional({
    description:
      'Pass "true" (or an empty photoUrl) to remove the current profile photo',
    example: 'true',
  })
  @IsString()
  @IsOptional()
  removePhoto?: string;
}
