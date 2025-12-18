import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssignmentsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement transport assignment logic
}
