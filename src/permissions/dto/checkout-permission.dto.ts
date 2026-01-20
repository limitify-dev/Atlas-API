import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CardCheckoutDto {
  @ApiProperty({
    description: 'Card number for checkout',
    example: '1234567890',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    description: 'Location where checkout is happening',
    example: 'Main Gate',
    required: false,
  })
  @IsString()
  @IsOptional()
  location?: string;

  @ApiProperty({
    description: 'Checkout date/time',
    example: '2025-01-15T10:30:00Z',
  })
  @IsDateString()
  @IsNotEmpty()
  checkoutTime: string;
}

export class CheckoutResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty({ required: false })
  permissionId?: string;

  @ApiProperty({ required: false })
  studentName?: string;

  @ApiProperty({ required: false })
  reason?: string;

  @ApiProperty({ required: false })
  checkoutTime?: string;

  @ApiProperty({ required: false })
  permissionType?: string;

  @ApiProperty({ required: false })
  error?: string;
}

export class CheckActivePermissionDto {
  @ApiProperty({
    description: 'Student ID to check',
    example: 'uuid-student-id',
  })
  @IsString()
  @IsNotEmpty()
  studentId: string;

  @ApiProperty({
    description: 'Date/time to check for active permission',
    example: '2025-01-15T10:30:00Z',
    required: false,
  })
  @IsDateString()
  @IsOptional()
  checkTime?: string;
}
