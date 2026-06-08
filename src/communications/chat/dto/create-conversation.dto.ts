import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({
    description: 'User ID of the participant to start a conversation with',
  })
  @IsString()
  @IsNotEmpty()
  participantId: string;
}
