import { IsString, IsOptional } from 'class-validator';

export class CreateChannelDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}
