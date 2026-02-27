import { ApiProperty } from '@nestjs/swagger';
import { Gender } from '../../../prisma/generated/client';
import {
  IsString,
  IsEmail,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNotEmpty,
} from 'class-validator';

export class CreateStudentDto {
  @ApiProperty({
    description: 'First name of the student',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({
    description: 'Last name of the student',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({
    description: 'Student email address',
    example: 'john.doe@school.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    description: 'Student phone number',
    example: '+1234567890',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    description: 'Date of birth',
    example: '2008-01-15',
  })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({
    description: 'Gender of the student',
    enum: Gender,
    example: 'MALE',
  })
  @IsEnum(Gender)
  @IsNotEmpty()
  gender: Gender;

  @ApiProperty({
    description: 'Nationality of the student',
    example: 'American',
    required: false,
  })
  @IsString()
  @IsOptional()
  nationality?: string;

  @ApiProperty({
    description: 'Student address',
    example: '123 Main St, City, State',
    required: false,
  })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiProperty({
    description: 'Blood group',
    example: 'O+',
    required: false,
  })
  @IsString()
  @IsOptional()
  bloodGroup?: string;

  @ApiProperty({
    description: 'Roll number',
    example: '001',
    required: false,
  })
  @IsString()
  @IsOptional()
  rollNumber?: string;

  @ApiProperty({
    description: 'Grade ID',
    example: 'uuid-grade-id',
  })
  @IsString()
  @IsNotEmpty()
  gradeId: string;

  @ApiProperty({
    description: 'Section ID',
    example: 'uuid-section-id',
  })
  @IsString()
  @IsNotEmpty()
  sectionId: string;

  @ApiProperty({
    description: 'Admission date',
    example: '2024-01-15',
  })
  @IsDateString()
  @IsNotEmpty()
  admissionDate: string;

  @ApiProperty({
    description: 'Photo URL',
    example: 'https://example.com/photo.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  photoUrl?: string;

  // Parent Information
  @ApiProperty({
    description: 'Parent/Guardian name',
    example: 'Jane Doe',
  })
  @IsString()
  @IsNotEmpty()
  parentName: string;

  @ApiProperty({
    description: 'Parent email',
    example: 'jane.doe@email.com',
  })
  @IsEmail()
  @IsNotEmpty()
  parentEmail: string;

  @ApiProperty({
    description: 'Parent phone',
    example: '+1234567890',
  })
  @IsString()
  @IsNotEmpty()
  parentPhone: string;

  @ApiProperty({
    description: 'Relationship with student',
    example: 'Mother',
    required: false,
  })
  @IsString()
  @IsOptional()
  relationship?: string;

  @ApiProperty({
    description: 'Parent occupation',
    example: 'Engineer',
    required: false,
  })
  @IsString()
  @IsOptional()
  occupation?: string;

  // Second Parent Information (Optional)
  @ApiProperty({
    description: 'Second Parent/Guardian name',
    example: 'John Doe',
    required: false,
  })
  @IsString()
  @IsOptional()
  parent2Name?: string;

  @ApiProperty({
    description: 'Second Parent email',
    example: 'john.doe@email.com',
    required: false,
  })
  @IsEmail()
  @IsOptional()
  parent2Email?: string;

  @ApiProperty({
    description: 'Second Parent phone',
    example: '+1234567890',
    required: false,
  })
  @IsString()
  @IsOptional()
  parent2Phone?: string;

  @ApiProperty({
    description: 'Relationship with student',
    example: 'Father',
    required: false,
  })
  @IsString()
  @IsOptional()
  parent2Relationship?: string;

  @ApiProperty({
    description: 'Second Parent occupation',
    example: 'Doctor',
    required: false,
  })
  @IsString()
  @IsOptional()
  parent2Occupation?: string;
}
