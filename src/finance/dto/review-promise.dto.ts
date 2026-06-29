import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewPromiseDto {
  @ApiProperty({ description: 'true = approve grace request, false = refuse' })
  @IsBoolean()
  approved: boolean;

  @ApiPropertyOptional({
    description: 'Required when refusing, optional when approving',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  approvalNote?: string;
}
