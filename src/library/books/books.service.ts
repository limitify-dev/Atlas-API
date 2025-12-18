import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  // TODO: Implement book logic
}
