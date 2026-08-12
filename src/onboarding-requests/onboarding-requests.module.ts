import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { OnboardingRequestsService } from './onboarding-requests.service';
import { OnboardingRequestsController } from './onboarding-requests.controller';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [OnboardingRequestsController],
  providers: [OnboardingRequestsService],
})
export class OnboardingRequestsModule {}
