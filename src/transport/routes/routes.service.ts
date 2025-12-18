import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class RoutesService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement bus route logic
}
