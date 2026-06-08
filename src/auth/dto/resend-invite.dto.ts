import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendInviteDto {
  @ApiProperty({ description: 'Current invite token to resend' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
