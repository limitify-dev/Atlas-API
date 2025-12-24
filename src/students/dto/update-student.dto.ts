import { PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './create-student.dto';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  // All fields from CreateStudentDto are now optional
  // Students don't have user accounts, so no status field needed
}
