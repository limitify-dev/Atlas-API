import { Controller } from '@nestjs/common';
import { ConductService } from './conduct.service';

@Controller('conduct')
export class ConductController {
  constructor(private readonly conductService: ConductService) {}

  // TODO: Implement conduct record endpoints
}
