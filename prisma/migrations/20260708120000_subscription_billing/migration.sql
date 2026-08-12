-- CreateEnum (must exist before referencing columns/tables)
CREATE TYPE "TenantSubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'SUSPENDED');
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHEQUE', 'MOBILE_MONEY', 'CARD', 'OTHER');
CREATE TYPE "SubscriptionCurrency" AS ENUM ('USD', 'EUR', 'GBP', 'UGX', 'KES', 'TZS', 'NGN', 'ZAR', 'RWF', 'GHS');
CREATE TYPE "SubscriptionAuditAction" AS ENUM ('PAYMENT_LOGGED', 'MANUALLY_EXTENDED', 'MANUALLY_SUSPENDED', 'MANUALLY_REACTIVATED', 'STATUS_AUTO_EXPIRED', 'STATUS_RECALCULATED', 'PAYMENT_DELETED', 'GRACE_PERIOD_UPDATED');

-- Add subscription & billing enforcement fields to tenants
ALTER TABLE "tenants" ADD COLUMN "subscriptionStatus" "TenantSubscriptionStatus";
ALTER TABLE "tenants" ADD COLUMN "currentPeriodStart" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "gracePeriodDays" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN "suspendedManually" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "suspensionReason" TEXT;

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paymentMethod" "SubscriptionPaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "referenceNumber" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "action" "SubscriptionAuditAction" NOT NULL,
    "performedById" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "subscription_payments_tenantId_idx" ON "subscription_payments"("tenantId");
CREATE INDEX "subscription_payments_paymentDate_idx" ON "subscription_payments"("paymentDate");
CREATE INDEX "subscription_payments_periodEnd_idx" ON "subscription_payments"("periodEnd");
CREATE INDEX "subscription_audit_logs_tenantId_idx" ON "subscription_audit_logs"("tenantId");
CREATE INDEX "subscription_audit_logs_action_idx" ON "subscription_audit_logs"("action");
CREATE INDEX "subscription_audit_logs_createdAt_idx" ON "subscription_audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_audit_logs" ADD CONSTRAINT "subscription_audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "subscription_audit_logs" ADD CONSTRAINT "subscription_audit_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
