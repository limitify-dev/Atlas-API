import {
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VerifyOtpDto {
  @ApiProperty({ example: '+237652301234' })
  @IsPhoneNumber()
  phone: string;

  @ApiProperty({ example: '482931', description: '6-digit OTP code' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits.' })
  code: string;

  @ApiPropertyOptional({
    description: 'Invite token — required for onboarding, omit for login',
  })
  @IsString()
  @IsOptional()
  inviteToken?: string;
}
