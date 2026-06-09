import { IsOptional, IsPhoneNumber, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendOtpDto {
  @ApiProperty({
    example: '+237652301234',
    description: 'Phone number in E.164 format',
  })
  @IsPhoneNumber()
  phone: string;

  @ApiPropertyOptional({
    description:
      'Invite token — required for onboarding OTPs, omit for login OTPs',
  })
  @IsString()
  @IsOptional()
  inviteToken?: string;
}
