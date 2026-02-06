import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, TenantStatus } from '../../../prisma/generated/client';

export class CreateTenantDto {
  @ApiProperty({
    description: 'Tenant/School name',
    example: 'Springfield Elementary School',
  })
  name: string;

  @ApiProperty({
    description: 'Unique slug for subdomain or identifier',
    example: 'springfield-elementary',
  })
  slug: string;

  @ApiPropertyOptional({
    description: 'Custom domain (optional)',
    example: 'school.springfield.edu',
  })
  domain?: string;

  @ApiPropertyOptional({
    description: 'School logo URL',
    example: 'https://example.com/logo.png',
  })
  logo?: string;

  @ApiPropertyOptional({
    description: 'Brand color for student ID cards (hex format)',
    example: '#3b82f6',
    default: '#1e40af',
  })
  brandColor?: string;

  @ApiPropertyOptional({
    description: 'School address',
    example: '123 School Street',
  })
  address?: string;

  @ApiPropertyOptional({
    description: 'City',
    example: 'Springfield',
  })
  city?: string;

  @ApiPropertyOptional({
    description: 'State/Province',
    example: 'Illinois',
  })
  state?: string;

  @ApiPropertyOptional({
    description: 'Country',
    example: 'USA',
  })
  country?: string;

  @ApiPropertyOptional({
    description: 'ZIP/Postal code',
    example: '62701',
  })
  zipCode?: string;

  @ApiPropertyOptional({
    description: 'Contact phone number',
    example: '+1234567890',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Contact email',
    example: 'admin@springfield.edu',
  })
  email?: string;

  @ApiPropertyOptional({
    description: 'School website',
    example: 'https://springfield.edu',
  })
  website?: string;

  @ApiPropertyOptional({
    description: 'Tenant timezone (IANA timezone)',
    example: 'Africa/Kampala',
    default: 'UTC',
  })
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Tenant status',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status?: TenantStatus;

  @ApiPropertyOptional({
    description: 'Subscription plan',
    enum: SubscriptionPlan,
    default: SubscriptionPlan.FREE,
  })
  subscriptionPlan?: SubscriptionPlan;

  @ApiPropertyOptional({
    description: 'Maximum number of students allowed',
    example: 100,
    default: 100,
  })
  maxStudents?: number;

  @ApiPropertyOptional({
    description: 'Maximum number of teachers allowed',
    example: 20,
    default: 20,
  })
  maxTeachers?: number;

  @ApiPropertyOptional({
    description: 'Custom settings (JSON)',
    example: { theme: 'light', language: 'en' },
  })
  settings?: Record<string, any>;
}
