import { SubscriptionPlan } from '../../../prisma/generated/client';

/** Monthly list price per plan tier, in USD. Single source of truth for
 * both revenue analytics and auto-generated billing records. */
export const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  FREE: 0,
  BASIC: 49,
  PREMIUM: 99,
  ENTERPRISE: 299,
};
