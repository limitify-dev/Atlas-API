import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant ID (null for super admins)',
    example: '123e4567-e89b-12d3-a456-426614174001',
    nullable: true,
  })
  tenantId: string | null;

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
  })
  email: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'User username',
    example: 'johnDoe',
  })
  username: string;

  @ApiProperty({
    description: 'User phone number',
    example: '+1234567890',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  avatar: string | null;

  @ApiProperty({
    description: 'User role',
    enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    example: 'USER',
  })
  role: string;

  @ApiProperty({
    description: 'User type',
    enum: ['TEACHER', 'STUDENT', 'PARENT', 'STAFF'],
    example: 'STUDENT',
    nullable: true,
  })
  userType: string | null;

  @ApiProperty({
    description: 'Account status',
    enum: ['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  status: string;

  @ApiProperty({
    description: 'Email verification status',
    example: true,
  })
  emailVerified: boolean;

  @ApiProperty({
    description: 'Account creation timestamp',
    example: '2025-12-05T10:30:00.000Z',
  })
  createdAt: Date;
}

export class AuthResponseDto {
  @ApiProperty({
    description: 'JWT access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({
    description: 'JWT refresh token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken: string;

  @ApiProperty({
    description: 'User information',
    type: UserDto,
  })
  user: UserDto;
}
