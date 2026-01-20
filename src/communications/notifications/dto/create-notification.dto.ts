import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';

export enum NotificationTargetType {
  ALL = 'ALL',
  TENANT = 'TENANT',
  ROLE = 'ROLE',
  USER_TYPE = 'USER_TYPE',
  USER = 'USER',
}

export enum NotificationType {
  SYSTEM_MAINTENANCE = 'SYSTEM_MAINTENANCE',
  NEW_FEATURE = 'NEW_FEATURE',
  IMPORTANT_UPDATE = 'IMPORTANT_UPDATE',
  GENERAL = 'GENERAL',
  ALERT = 'ALERT',
}

export class CreateNotificationDto {
  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsEnum(NotificationType)
  @IsOptional()
  type?: NotificationType = NotificationType.GENERAL;

  @IsEnum(NotificationTargetType)
  targetType: NotificationTargetType;

  @IsString()
  @IsOptional()
  targetId?: string; // tenantId, role name, or userId depending on targetType

  @IsArray()
  @IsOptional()
  targetIds?: string[]; // For multiple targets

  @IsOptional()
  data?: any; // Additional JSON data
}

export class NotificationFiltersDto {
  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  targetType?: string;

  @IsString()
  @IsOptional()
  search?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
