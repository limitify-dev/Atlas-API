import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ParentsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement parent logic
}
