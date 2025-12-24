import { PartialType } from '@nestjs/swagger';
import { CreateCombinationDto } from './create-combination.dto';

export class UpdateCombinationDto extends PartialType(CreateCombinationDto) {}
