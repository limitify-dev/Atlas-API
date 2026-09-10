import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  Min,
  Max,
  IsArray,
  ValidateNested,
  Matches,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  DeviceType,
  DeviceStatus,
  DeviceDirection,
} from '../../../prisma/generated/client';

export class RegisterDeviceDto {
  @ApiProperty({ example: 'Main Gate Reader' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: DeviceType, example: DeviceType.EDGE_DEVICE })
  @IsEnum(DeviceType)
  deviceType: DeviceType;

  @ApiPropertyOptional({ example: 'Main entrance' })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: DeviceDirection })
  @IsEnum(DeviceDirection)
  @IsOptional()
  direction?: DeviceDirection;

  @ApiPropertyOptional({
    example: 60,
    description: 'Heartbeat interval (seconds)',
  })
  @IsInt()
  @Min(15)
  @Max(3600)
  @IsOptional()
  heartbeatIntervalSec?: number;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  location?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ enum: DeviceStatus })
  @IsEnum(DeviceStatus)
  @IsOptional()
  status?: DeviceStatus;

  @ApiPropertyOptional({ enum: DeviceDirection })
  @IsEnum(DeviceDirection)
  @IsOptional()
  direction?: DeviceDirection;

  @ApiPropertyOptional({ example: 60 })
  @IsInt()
  @Min(15)
  @Max(3600)
  @IsOptional()
  heartbeatIntervalSec?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  expectedOnline?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  networkName?: string;
}

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;

export class DeviceScanDto {
  @ApiProperty({
    example: '0004291763',
    description: 'Raw card number from the reader',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    example: '2026-09-09T07:45:00.000Z',
    description: 'Scan timestamp (ISO 8601)',
  })
  @IsString()
  @Matches(ISO_DATETIME, {
    message: 'scannedAt must be ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)',
  })
  scannedAt: string;

  @ApiPropertyOptional({
    enum: DeviceDirection,
    description: 'Overrides the device default direction for this scan',
  })
  @IsEnum(DeviceDirection)
  @IsOptional()
  direction?: DeviceDirection;

  @ApiPropertyOptional({
    description: 'Device-generated dedupe key for offline replay',
  })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 'Main entrance' })
  @IsString()
  @IsOptional()
  location?: string;
}

export class DeviceScanBatchDto {
  @ApiProperty({
    type: [DeviceScanDto],
    description: 'Buffered scans from the device',
  })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => DeviceScanDto)
  scans: DeviceScanDto[];
}
