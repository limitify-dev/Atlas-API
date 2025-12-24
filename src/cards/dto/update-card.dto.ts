import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CardStatus } from '../../../prisma/generated/client';

export class UpdateCardDto {
  @ApiProperty({
    description: 'Status of the card',
    enum: CardStatus,
    required: false,
  })
  @IsEnum(CardStatus)
  @IsOptional()
  status?: CardStatus;

  @ApiProperty({
    description: 'ID of the student to assign to (optional)',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  studentId?: string | null;

  @ApiProperty({
    description: 'ID of the teacher to assign to (optional)',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  teacherId?: string | null;

  @ApiProperty({
    description: 'Additional notes',
    required: false,
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
