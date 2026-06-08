import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OnboardingMode, Role } from '../../../prisma/generated/client';

export class CreateInviteDto {
  @ApiProperty({ example: '+237652301234', description: 'Phone number in E.164 format' })
  @IsPhoneNumber()
  phone: string;

  @ApiPropertyOptional({ example: 'Jean Dupont' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'jean@school.cm' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiProperty({ enum: Role, example: Role.PARENT })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({
    description: 'studentId for PARENT, teacherId for TEACHER, staffId for STAFF',
  })
  @IsUUID()
  @IsOptional()
  referenceId?: string;

  @ApiProperty({ enum: OnboardingMode, example: OnboardingMode.OTP })
  @IsEnum(OnboardingMode)
  @IsNotEmpty()
  onboardingMode: OnboardingMode;
}
