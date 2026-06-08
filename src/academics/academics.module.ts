import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { AcademicTimelinesController } from './timelines/academic-timelines.controller';
import { AcademicTimelinesService } from './timelines/academic-timelines.service';

@Module({
  imports: [PrismaModule],
  controllers: [AcademicsController, AcademicTimelinesController],
  providers: [AcademicsService, AcademicTimelinesService],
  exports: [AcademicsService, AcademicTimelinesService],
})
export class AcademicsModule {}
