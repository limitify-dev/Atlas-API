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
    description: 'User email address (null for phone-only accounts)',
    example: 'john.doe@example.com',
    nullable: true,
  })
  email: string | null;

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
  avatar?: string | null;

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
  userType?: string | null;

  @ApiProperty({
    description: 'Account status',
    enum: ['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'],
    example: 'ACTIVE',
  })
  status: string | null;

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

  @ApiProperty({
    description: 'User timezone',
    example: 'UTC',
    nullable: true,
  })
  timezone?: string | null;

  @ApiProperty({
    description: 'School name',
    example: 'Springfield High School',
    nullable: true,
  })
  schoolName?: string | null;

  @ApiProperty({
    description: 'School logo URL',
    example: 'https://example.com/logo.png',
    nullable: true,
  })
  schoolLogo?: string | null;

  @ApiProperty({
    description: 'Brand color',
    example: '#1e40af',
    nullable: true,
  })
  brandColor?: string | null;
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
