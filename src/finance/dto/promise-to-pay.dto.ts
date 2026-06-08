import { IsDateString, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PromiseToPayDto {
  @ApiProperty({ example: '2025-02-15', description: 'Must be a future date' })
  @IsDateString()
  promisedDate: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
