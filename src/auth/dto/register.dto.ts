import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
  })
  email: string;

  @ApiProperty({
    description: 'User password (minimum 8 characters)',
    example: 'SecurePass123!',
    minLength: 8,
  })
  password: string;

  @ApiProperty({
    description: 'User full name',
    example: 'John Doe',
  })
  name: string;

  @ApiProperty({
    description: 'Username',
    example: 'johnDoe_12',
  })
  username: string;

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Tenant ID (optional, for regular users)',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'User type',
    enum: ['TEACHER', 'STUDENT', 'PARENT', 'STAFF'],
    example: 'STUDENT',
  })
  userType?: string;

  @ApiPropertyOptional({
    description: 'User role',
    enum: ['SUPER_ADMIN', 'ADMIN', 'USER'],
    example: 'USER',
    default: 'USER',
  })
  role?: 'SUPER_ADMIN' | 'ADMIN' | 'USER';
}
