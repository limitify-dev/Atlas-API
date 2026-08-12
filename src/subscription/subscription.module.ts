import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SubscriptionBillingService } from './services/subscription-billing.service';
import { SystemSettingsService } from './services/system-settings.service';
import { SubscriptionCronService } from './services/subscription-cron.service';

/**
 * Global module exposing subscription & billing services (status
 * recalculation, manual payments, audit, system settings) so they can be
 * injected by the auth layer, the enforcement guard, and Studio controllers
 * without import cycles.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [
    SubscriptionBillingService,
    SystemSettingsService,
    SubscriptionCronService,
  ],
  exports: [SubscriptionBillingService, SystemSettingsService],
})
export class SubscriptionModule {}
