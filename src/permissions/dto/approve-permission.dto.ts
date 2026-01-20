import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class ApprovePermissionDto {
  @ApiProperty({
    description: 'Remarks for approval',
    example: 'Approved for medical reasons',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}

export class RejectPermissionDto {
  @ApiProperty({
    description: 'Reason for rejection',
    example: 'Incomplete documentation provided',
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
