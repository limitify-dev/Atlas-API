import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreatePollDto {
  @IsString()
  @MinLength(1)
  question: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  options: string[];

  @IsOptional()
  @IsString()
  audience?: string;

  @IsOptional()
  @IsBoolean()
  allowMultiple?: boolean;

  @IsOptional()
  @IsString()
  expiresAt?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'DRAFT'])
  status?: 'ACTIVE' | 'DRAFT';
}

export class VotePollDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  optionIds: string[];
}

export class PollFiltersDto {
  @IsOptional()
  @IsIn(['ACTIVE', 'CLOSED', 'DRAFT'])
  status?: 'ACTIVE' | 'CLOSED' | 'DRAFT';

  @IsOptional()
  @IsString()
  audience?: string;
}
