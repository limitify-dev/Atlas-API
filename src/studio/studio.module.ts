import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { StudioController } from './studio.controller';
import { StudioTenantsService } from './services/studio-tenants.service';
import { StudioModulesService } from './services/studio-modules.service';
import { StudioSubscriptionService } from './services/studio-subscription.service';
import { AdminProvisionService } from './services/admin-provision.service';
import { BillingService } from './services/billing.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { FeedbackService } from './services/feedback.service';

@Module({
  imports: [PrismaModule, EmailModule],
  controllers: [StudioController],
  providers: [
    StudioTenantsService,
    StudioModulesService,
    StudioSubscriptionService,
    AdminProvisionService,
    BillingService,
    AdminApprovalService,
    FeedbackService,
  ],
  exports: [StudioModulesService, AdminApprovalService, FeedbackService],
})
export class StudioModule {}
