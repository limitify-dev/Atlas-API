import { Module } from '@nestjs/common';
import { CardsService } from './cards.service';
import { CardsController } from './cards.controller';
import { StudioCardsController } from './studio-cards.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CardsController, StudioCardsController],
  providers: [CardsService],
  exports: [CardsService],
})
export class CardsModule {}
