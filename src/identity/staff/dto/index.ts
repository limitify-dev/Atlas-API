import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PartialType } from '@nestjs/swagger';

export class CreateStaffDto {
  @ApiProperty()
  @IsUUID()
  userId: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: 'Finance' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({
    example: 'finance',
    description:
      'studies | dos (Director of Studies) | discipline | dm (Discipline Master) | finance | bursar',
  })
  @IsString()
  @IsNotEmpty()
  staffRole: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  photoUrl?: string;

  @ApiProperty()
  @IsDateString()
  joiningDate: string;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}

export class RegisterStaffDto {
  @ApiProperty({ example: 'John' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiPropertyOptional({ example: 'john.doe@school.edu' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'Finance' })
  @IsString()
  @IsOptional()
  department?: string;

  @ApiProperty({ example: 'finance' })
  @IsString()
  @IsNotEmpty()
  staffRole: string;

  @ApiProperty()
  @IsDateString()
  joiningDate: string;
}

export class StaffFiltersDto {
  @ApiPropertyOptional({ example: 'finance' })
  @IsString()
  @IsOptional()
  staffRole?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  department?: string;
}
