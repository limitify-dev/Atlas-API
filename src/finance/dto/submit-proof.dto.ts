import { IsOptional, IsString, IsUrl, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubmitProofDto {
  @ApiProperty({ description: 'Supabase storage URL for the payment proof image/PDF' })
  @IsUrl({}, { message: 'proofUrl must be a valid URL' })
  proofUrl: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ example: '250.00', description: 'Amount the parent claims to have paid' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'amountClaimed must be a valid decimal' })
  @IsOptional()
  amountClaimed?: string;
}
