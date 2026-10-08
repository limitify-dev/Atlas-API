import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsEnum,
  IsDateString,
  IsNumber,
  IsPositive,
  IsInt,
  ArrayMinSize,
  Matches,
  Length,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  BillingCycle,
  BillingStatus,
  AdminApprovalStatus,
  FeedbackCategory,
  FeedbackStatus,
  FeedbackPriority,
  SubscriptionPaymentMethod,
  SubscriptionCurrency,
  TenantSubscriptionStatus,
  SubscriptionAuditAction,
  CardType,
} from '../../../prisma/generated/client';

export class CreateStudioTenantDto {
  @ApiProperty({ example: 'Saint Ignatius High School' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'saint-ignatius' })
  @IsString()
  slug: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: '08:00', default: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  attendanceStartTime?: string;

  @ApiPropertyOptional({ example: '17:00', default: '17:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  attendanceEndTime?: string;

  @ApiPropertyOptional({
    example: [1, 2, 3, 4, 5],
    description: 'School weekdays, where Sunday is 0 and Saturday is 6',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  schoolDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandColor?: string;

  // Initial admin invite
  @ApiPropertyOptional({ example: 'admin@school.com' })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: '+250788000000' })
  @IsOptional()
  @IsString()
  adminPhone?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  adminName?: string;

  // Subscription
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({
    example: 30,
    description: 'Trial period in days (default 30)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  trialDays?: number;
}

export class UpdateTenantAttendanceScheduleDto {
  @ApiProperty({ example: '08:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string;

  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: 'School weekdays, where Sunday is 0 and Saturday is 6',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  schoolDays: number[];
}

export class UpdateTenantModulesDto {
  @ApiProperty({ example: ['academics', 'attendance'] })
  @IsArray()
  @IsString({ each: true })
  enabledModules: string[];
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: SubscriptionPlan })
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateTenantStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED', 'TRIAL', 'CANCELLED'] })
  @IsString()
  status: string;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'saint-ignatius' })
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brandColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  domain?: string;
}

export class CreateAdminInviteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: ['ADMIN', 'TEACHER', 'STAFF'] })
  @IsOptional()
  @IsString()
  role?: string;
}

// ── Billing ─────────────────────────────────────────────────────────────────

export class CreateBillingDto {
  @ApiProperty({ enum: BillingCycle })
  @IsEnum(BillingCycle)
  billingCycle: BillingCycle;

  @ApiProperty({ example: 299.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty()
  @IsDateString()
  dueDate: string;

  @ApiProperty()
  @IsDateString()
  periodStart: string;

  @ApiProperty()
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateBillingDto {
  @ApiPropertyOptional({ enum: BillingStatus })
  @IsOptional()
  @IsEnum(BillingStatus)
  status?: BillingStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paidAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ enum: BillingCycle })
  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @ApiPropertyOptional({ example: 299.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}

// ── Admin Approvals ──────────────────────────────────────────────────────────

export class ReviewApprovalDto {
  @ApiProperty({ enum: AdminApprovalStatus })
  @IsEnum(AdminApprovalStatus)
  status: AdminApprovalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ── Feedback ─────────────────────────────────────────────────────────────────

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackCategory })
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @ApiProperty({ example: 'The app crashes when I try to view report cards.' })
  @IsString()
  @Length(1, 2000)
  message: string;
}

export class UpdateFeedbackDto {
  @ApiPropertyOptional({ enum: FeedbackStatus })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackPriority })
  @IsOptional()
  @IsEnum(FeedbackPriority)
  priority?: FeedbackPriority;

  @ApiPropertyOptional({ example: 'v1.2' })
  @IsOptional()
  @IsString()
  plannedRelease?: string;
}

// ── Subscription & Billing management ────────────────────────────────────────

export class LogPaymentDto {
  @ApiProperty({ example: 299.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ enum: SubscriptionCurrency, default: 'USD' })
  @IsOptional()
  @IsEnum(SubscriptionCurrency)
  currency?: SubscriptionCurrency;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiProperty({ description: 'Coverage window start (ISO date)' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ description: 'Coverage window end (ISO date)' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({ enum: SubscriptionPaymentMethod })
  @IsOptional()
  @IsEnum(SubscriptionPaymentMethod)
  paymentMethod?: SubscriptionPaymentMethod;

  @ApiPropertyOptional({ example: 'INV-2024-001' })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ExtendSubscriptionDto {
  @ApiPropertyOptional({ description: 'Coverage window start (ISO date)' })
  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @ApiProperty({ description: 'New coverage window end (ISO date)' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({ description: 'Reason for manual extension / comp' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SuspendSubscriptionDto {
  @ApiProperty({ description: 'Required reason for manual suspension' })
  @IsString()
  @Length(3, 500)
  reason: string;
}

export class UpdateGracePeriodDto {
  @ApiProperty({
    example: 7,
    description: 'Grace period in days (0 = no grace)',
  })
  @IsNumber()
  @Min(0)
  @Max(365)
  @Type(() => Number)
  days: number;
}

export class SubscriptionQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ enum: SubscriptionPaymentMethod })
  @IsOptional()
  @IsEnum(SubscriptionPaymentMethod)
  method?: SubscriptionPaymentMethod;
}

export class SystemSettingDto {
  @ApiProperty({ description: 'Setting key, e.g. support.contact' })
  @IsString()
  key: string;

  @ApiProperty({ description: 'Arbitrary JSON value' })
  value: unknown;
}

export class CreateCardTemplateDto {
  @ApiProperty({ example: 'Standard Student ID' })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description: 'Tenant this template belongs to. Omit for a platform-wide default template.',
  })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({ enum: CardType, default: CardType.STUDENT })
  @IsOptional()
  @IsEnum(CardType)
  cardType?: CardType;

  @ApiPropertyOptional({ default: 85.6 })
  @IsOptional()
  @IsNumber()
  widthMm?: number;

  @ApiPropertyOptional({ default: 54 })
  @IsOptional()
  @IsNumber()
  heightMm?: number;

  @ApiPropertyOptional({
    description: 'Canvas design tree (Fabric.js JSON). Defaults to a blank canvas.',
  })
  @IsOptional()
  design?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateCardTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: CardType })
  @IsOptional()
  @IsEnum(CardType)
  cardType?: CardType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  widthMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  heightMm?: number;

  @ApiPropertyOptional({ description: 'Canvas design tree (Fabric.js JSON).' })
  @IsOptional()
  design?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export { TenantSubscriptionStatus, SubscriptionAuditAction };
