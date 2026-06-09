import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';

export class CreatePromotionDto {
  @ApiProperty({
    example: 'Promotion 2023',
    description: 'Human-readable cohort name',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 2023, description: 'Year this cohort enrolled' })
  @IsInt()
  @Min(2000)
  @Max(2100)
  @Type(() => Number)
  entryYear: number;

  @ApiPropertyOptional({
    example: 'Five-year secondary programme, 2023 intake',
  })
  @IsString()
  @IsOptional()
  description?: string;
}

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PromotionFiltersDto {
  @ApiPropertyOptional()
  @IsInt()
  @Min(2000)
  @IsOptional()
  @Type(() => Number)
  entryYear?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
