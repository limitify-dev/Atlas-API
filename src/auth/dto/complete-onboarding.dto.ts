import {
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteOnboardingDto {
  @ApiProperty({ description: 'Invite token from the invitation link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    example: '+237652301234',
    description: 'Must match the phone on the invite',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: 'Jean Dupont' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description:
      'Required for PASSWORD mode (teacher/staff). Min 8 characters.',
    minLength: 8,
  })
  @IsString()
  @MinLength(8)
  @IsOptional()
  password?: string;

  @ApiPropertyOptional({
    description: 'Optional email address (recommended for teacher/staff)',
  })
  @IsString()
  @IsOptional()
  email?: string;
}
