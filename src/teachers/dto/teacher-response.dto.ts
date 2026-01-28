import { ApiProperty } from '@nestjs/swagger';
import { Gender, Status } from '../../../prisma/generated/client';

export class TeacherResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  teacherId: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @ApiProperty()
  email: string;

  @ApiProperty({ required: false })
  phone?: string;
  
  @ApiProperty({
    description: 'Photo URL',
    example: 'https://example.com/photo.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiProperty({ required: false })
  department?: string;

  @ApiProperty({ required: false })
  joiningDate?: Date;

  @ApiProperty({ enum: Gender, required: false })
  gender?: Gender;

  @ApiProperty({ required: false })
  qualification?: string;

  @ApiProperty({ required: false })
  specialization?: string;

  @ApiProperty({ enum: Status })
  status: Status;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({ required: false, nullable: true })
  card?: {
    id: string;
    cardNumber: string;
    status: string;
  } | null;
}
