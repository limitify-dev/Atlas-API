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

  @ApiProperty({ example: 'finance', description: 'finance | discipline | reception | IT | custom' })
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
