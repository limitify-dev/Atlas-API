import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreatePermissionDto } from './create-permission.dto';
import { IsString, IsOptional } from 'class-validator';

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {
  @ApiProperty({
    description: 'Additional remarks for the update',
    example: 'Changed time slot per parent request',
    required: false,
  })
  @IsString()
  @IsOptional()
  remarks?: string;
}
