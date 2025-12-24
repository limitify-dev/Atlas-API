import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CardType } from '../../../prisma/generated/client';

export class CreateCardDto {
  @ApiProperty({
    description: 'Card Number (UID)',
    example: 'A1B2C3D4',
  })
  @IsString()
  @IsNotEmpty()
  cardNumber: string;

  @ApiProperty({
    description: 'Type of the card owner',
    enum: CardType,
    example: 'STUDENT',
  })
  @IsEnum(CardType)
  @IsNotEmpty()
  cardType: CardType;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
