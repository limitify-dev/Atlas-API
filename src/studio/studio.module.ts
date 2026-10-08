import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { GradesModule } from '../grades/grades.module';
import { SectionsModule } from '../sections/sections.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { TeachersModule } from '../teachers/teachers.module';
import { StudioController } from './studio.controller';
import { StudioTenantsService } from './services/studio-tenants.service';
import { StudioModulesService } from './services/studio-modules.service';
import { StudioSubscriptionService } from './services/studio-subscription.service';
import { AdminProvisionService } from './services/admin-provision.service';
import { BillingService } from './services/billing.service';
import { AdminApprovalService } from './services/admin-approval.service';
import { FeedbackService } from './services/feedback.service';
import { StudioCardTemplatesService } from './services/studio-card-templates.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    GradesModule,
    SectionsModule,
    PromotionsModule,
    TeachersModule,
  ],
  controllers: [StudioController],
  providers: [
    StudioTenantsService,
    StudioModulesService,
    StudioSubscriptionService,
    AdminProvisionService,
    BillingService,
    AdminApprovalService,
    FeedbackService,
    StudioCardTemplatesService,
  ],
  exports: [StudioModulesService, AdminApprovalService, FeedbackService],
})
export class StudioModule {}
