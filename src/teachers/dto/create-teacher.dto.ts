import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
} from 'class-validator';
import { Gender } from '../../../prisma/generated/client';

export class CreateTeacherDto {
  @ApiProperty({ example: 'John' })
  @IsNotEmpty()
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsNotEmpty()
  @IsString()
  lastName: string;

  @ApiProperty({ example: 'john.doe@school.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Science', required: false })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiProperty({ example: '2024-01-01', required: false })
  @IsOptional()
  @IsDateString()
  joiningDate?: string;

  @ApiProperty({ example: 'MALE', enum: Gender, required: false })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiProperty({ example: 'PhD in Physics', required: false })
  @IsOptional()
  @IsString()
  qualification?: string;

  @ApiProperty({ example: 'Quantum Mechanics', required: false })
  @IsOptional()
  @IsString()
  specialization?: string;
  
  @ApiProperty({ example: '1980-01-01', required: false })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;
}
