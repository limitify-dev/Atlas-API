import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role, Status, UserType } from '../../../prisma/generated/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'User name', example: 'John Doe' })
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @ApiPropertyOptional({
    description: 'User email',
    example: 'user@mail.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be valid' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Username tag',
    example: 'johnDoe12',
  })
  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  username?: string;

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'User role',
    enum: Role,
  })
  @IsOptional()
  @IsEnum(Role, { message: 'Role is invalid' })
  role?: Role;

  @ApiPropertyOptional({
    description: 'User type',
    enum: UserType,
    nullable: true,
  })
  @IsOptional()
  @IsEnum(UserType, { message: 'User type is invalid' })
  userType?: UserType | null;

  @ApiPropertyOptional({
    description: 'User password',
    example: '**********',
  })
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password?: string;

  @ApiPropertyOptional({
    description: 'Tenant ID',
    example: 'tenant_12345',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Tenant ID must be a string' })
  tenantId?: string | null;

  @ApiPropertyOptional({
    description: 'Account status',
    enum: Status,
  })
  @IsOptional()
  @IsEnum(Status, { message: 'Status is invalid' })
  status?: Status;
}
