import { Controller } from '@nestjs/common';
import { RoutesService } from './routes.service';

@Controller('transport/routes')
export class RoutesController {
  constructor(private readonly routesService: RoutesService) {}

  // TODO: Implement bus route endpoints
}
