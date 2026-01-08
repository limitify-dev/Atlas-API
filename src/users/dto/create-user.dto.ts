import { ApiProperty } from '@nestjs/swagger';
import { Role, Status, UserType } from '../../../prisma/generated/client';
import { IsString, MinLength, IsOptional } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'User email',
    example: 'user@mail.com',
  })
  email: string;

  @ApiProperty({
    description: 'Username tag',
    example: 'johnDoe12',
  })
  username: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1234567890',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'User role',
    enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    example: 'USER',
  })
  role: Role;

  @ApiProperty({
    description: 'User type',
    enum: ['TEACHER', 'STUDENT', 'PARENT', 'STAFF'],
    example: 'STUDENT',
    nullable: true,
  })
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
  tenantId: string | null;

  @ApiProperty({
    description: 'Account status',
    example: 'ACTIVE',
  })
  status: Status;
}
