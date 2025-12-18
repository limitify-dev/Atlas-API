import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GradesService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement grade logic
}
