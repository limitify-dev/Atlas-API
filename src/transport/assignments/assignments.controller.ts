import { Controller } from '@nestjs/common';
import { AssignmentsService } from './assignments.service';

@Controller('transport/assignments')
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  // TODO: Implement transport assignment endpoints
}
