import { IsString, IsOptional, IsEmail, IsArray, IsBoolean, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStudioTenantDto {
  @ApiProperty({ example: 'Saint Ignatius High School' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'saint-ignatius' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  brandColor?: string;

  // Initial admin invite
  @ApiPropertyOptional({ example: 'admin@school.com' })
  @IsOptional() @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional() @IsString()
  adminPhone?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional() @IsString()
  adminName?: string;

  // Subscription
  @ApiPropertyOptional({ enum: ['BASIC','STANDARD','PREMIUM','ENTERPRISE'] })
  @IsOptional() @IsString()
  plan?: string;
}

export class UpdateTenantModulesDto {
  @ApiProperty({ example: ['academics','attendance'] })
  @IsArray() @IsString({ each: true })
  enabledModules: string[];
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: ['BASIC','STANDARD','PREMIUM','ENTERPRISE'] })
  @IsOptional() @IsString()
  plan?: string;

  @ApiPropertyOptional({ enum: ['TRIAL','ACTIVE','EXPIRED','SUSPENDED','CANCELLED'] })
  @IsOptional() @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: ['ACTIVE','SUSPENDED','TRIAL','CANCELLED'] })
  @IsString()
  status: string;
}

export class CreateAdminInviteDto {
  @ApiPropertyOptional()
  @IsOptional() @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['ADMIN','TEACHER','STAFF'] })
  @IsOptional() @IsString()
  role?: string;
}
