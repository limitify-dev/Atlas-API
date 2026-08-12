import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionBillingService } from './subscription-billing.service';

@Injectable()
export class SubscriptionCronService {
  private readonly logger = new Logger(SubscriptionCronService.name);

  constructor(
    private readonly subscriptionBilling: SubscriptionBillingService,
  ) {}

  /**
   * Daily recalculation of every tenant's cached subscription status.
   * Writes an audit row when a tenant transitions into EXPIRED.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyRecalculation() {
    this.logger.log('Running daily subscription status recalculation…');
    try {
      const expired = await this.subscriptionBilling.recalculateAll();
      this.logger.log(`Recalculation complete. ${expired} tenant(s) expired.`);
    } catch (err) {
      this.logger.error(
        'Daily subscription recalculation failed',
        err as Error,
      );
    }
  }
}
