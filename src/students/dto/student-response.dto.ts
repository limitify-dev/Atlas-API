import { ApiProperty } from '@nestjs/swagger';
import { Gender, Status } from '../../../prisma/generated/client';

export class StudentResponseDto {
  @ApiProperty({
    description: 'Student unique identifier',
    example: 'uuid',
  })
  id: string;

  @ApiProperty({
    description: 'Student ID (e.g., ST001)',
    example: 'ST001',
  })
  studentId: string;

  @ApiProperty({
    description: 'First name',
    example: 'John',
  })
  firstName: string;

  @ApiProperty({
    description: 'Last name',
    example: 'Doe',
  })
  lastName: string;

  @ApiProperty({
    description: 'Full name',
    example: 'John Doe',
  })
  fullName: string;

  @ApiProperty({
    description: 'Email address',
    example: 'john.doe@school.com',
  })
  email: string;

  @ApiProperty({
    description: 'Phone number',
    example: '+1234567890',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'Date of birth',
    example: '2008-01-15T00:00:00.000Z',
  })
  dateOfBirth: Date;

  @ApiProperty({
    description: 'Gender',
    enum: Gender,
    example: 'MALE',
  })
  gender: Gender;

  @ApiProperty({
    description: 'Nationality',
    example: 'American',
    nullable: true,
  })
  nationality: string | null;

  @ApiProperty({
    description: 'Address',
    example: '123 Main St, City, State',
    nullable: true,
  })
  address: string | null;

  @ApiProperty({
    description: 'Blood group',
    example: 'O+',
    nullable: true,
  })
  bloodGroup: string | null;

  @ApiProperty({
    description: 'Roll number',
    example: '001',
    nullable: true,
  })
  rollNumber: string | null;

  @ApiProperty({
    description: 'Admission date',
    example: '2024-01-15T00:00:00.000Z',
  })
  admissionDate: Date;

  @ApiProperty({
    description: 'Photo URL',
    example: 'https://example.com/photo.jpg',
    nullable: true,
  })
  photoUrl: string | null;

  @ApiProperty({
    description: 'Student status',
    enum: Status,
    example: 'ACTIVE',
  })
  status: Status;

  @ApiProperty({
    description: 'Grade information',
  })
  grade: {
    id: string;
    name: string;
    level: number;
    educationLevel: string;
  };

  @ApiProperty({
    description: 'Section information',
  })
  section: {
    id: string;
    name: string;
  };

  @ApiProperty({
    description: 'Parent information',
  })
  parents: Array<{
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string;
    phone: string | null;
    relationship: string | null;
    occupation: string | null;
    isPrimary: boolean;
  }>;

  @ApiProperty({
    description: 'Created at timestamp',
    example: '2024-01-15T00:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated at timestamp',
    example: '2024-01-15T00:00:00.000Z',
  })
  updatedAt: Date;
}
