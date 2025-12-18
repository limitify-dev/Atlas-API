import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SectionsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement section logic
}
