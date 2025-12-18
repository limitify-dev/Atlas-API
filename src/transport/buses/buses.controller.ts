import { Controller } from '@nestjs/common';
import { BusesService } from './buses.service';

@Controller('transport/buses')
export class BusesController {
  constructor(private readonly busesService: BusesService) {}

  // TODO: Implement bus endpoints
}
