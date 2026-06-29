import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitProofDto {
  @ApiPropertyOptional({
    description: 'Supabase storage URL for the payment proof image/PDF',
  })
  @IsString()
  @IsOptional()
  proofUrl?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({
    example: '250.00',
    description: 'Amount the parent claims to have paid',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'amountClaimed must be a valid decimal',
  })
  @IsOptional()
  amountClaimed?: string;
}
