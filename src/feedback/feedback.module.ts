import { Module } from '@nestjs/common';
import { StudioModule } from '../studio/studio.module';
import { FeedbackController } from './feedback.controller';

@Module({
  imports: [StudioModule],
  controllers: [FeedbackController],
})
export class FeedbackModule {}
