import { ApiProperty } from '@nestjs/swagger';
import { Role, Status, UserType } from '../../../prisma/generated/client';
import {
  IsString,
  MinLength,
  IsOptional,
  IsEmail,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Name is required' })
  name: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@mail.com',
  })
  @IsEmail({}, { message: 'Email must be valid' })
  email: string;

  @ApiProperty({
    description: 'Username tag',
    example: 'johnDoe12',
  })
  @IsString({ message: 'Username must be a string' })
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1234567890',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone: string | null;

  @ApiProperty({
    description: 'User role',
    enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    example: 'USER',
  })
  @IsEnum(Role, { message: 'Role is invalid' })
  role: Role;

  @ApiProperty({
    description: 'User type',
    enum: ['TEACHER', 'STUDENT', 'PARENT', 'STAFF'],
    example: 'STUDENT',
    nullable: true,
  })
  @IsOptional()
  @IsEnum(UserType, { message: 'User type is invalid' })
  userType: UserType | null;

  @ApiProperty({
    description: 'User password',
    example: '**********',
  })
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiProperty({
    description: 'Tenant ID',
    example: 'tenant_12345',
    nullable: true,
  })
  @IsOptional()
  @IsString({ message: 'Tenant ID must be a string' })
  tenantId: string | null;

  @ApiProperty({
    description: 'Account status',
    example: 'ACTIVE',
  })
  @IsEnum(Status, { message: 'Status is invalid' })
  status: Status;
}
