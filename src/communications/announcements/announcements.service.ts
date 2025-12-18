import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement announcement logic
}
