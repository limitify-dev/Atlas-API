import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import {
  OnboardingRequestIntent,
  OnboardingRequestStatus,
} from '../../../prisma/generated/client';

export class CreateOnboardingRequestDto {
  @ApiProperty({ enum: OnboardingRequestIntent })
  @IsEnum(OnboardingRequestIntent)
  intent: OnboardingRequestIntent;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  organization: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  role: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  schoolSize: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  preferredDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredTime?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  goals: string;
}

export class UpdateOnboardingRequestDto {
  @ApiPropertyOptional({ enum: OnboardingRequestStatus })
  @IsOptional()
  @IsEnum(OnboardingRequestStatus)
  status?: OnboardingRequestStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
