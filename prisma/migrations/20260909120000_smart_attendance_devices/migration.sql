-- Smart Attendance & Reporting — Phase 6: device fields, raw scan audit,
-- SchoolEntry → Device foreign key.

-- CreateEnum
CREATE TYPE "DeviceDirection" AS ENUM ('IN', 'OUT', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "DeviceScanOutcome" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'DUPLICATE', 'UNKNOWN_CARD', 'INACTIVE_CARD', 'ERROR');

-- AlterTable: extra device telemetry + network + config columns
ALTER TABLE "devices"
  ADD COLUMN "lastHeartbeatAt" TIMESTAMP(3),
  ADD COLUMN "macAddress" TEXT,
  ADD COLUMN "networkName" TEXT,
  ADD COLUMN "firmwareVersion" TEXT,
  ADD COLUMN "expectedOnline" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "heartbeatIntervalSec" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "direction" "DeviceDirection" NOT NULL DEFAULT 'BIDIRECTIONAL';

-- CreateTable: raw device scan audit
CREATE TABLE "device_scans" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL,
    "direction" "DeviceDirection" NOT NULL DEFAULT 'BIDIRECTIONAL',
    "outcome" "DeviceScanOutcome" NOT NULL,
    "resolvedStudentId" TEXT,
    "schoolEntryId" TEXT,
    "idempotencyKey" TEXT,
    "errorReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_scans_deviceId_idempotencyKey_key" ON "device_scans"("deviceId", "idempotencyKey");
CREATE INDEX "device_scans_tenantId_scannedAt_idx" ON "device_scans"("tenantId", "scannedAt");
CREATE INDEX "device_scans_deviceId_scannedAt_idx" ON "device_scans"("deviceId", "scannedAt");
CREATE INDEX "device_scans_outcome_idx" ON "device_scans"("outcome");
CREATE INDEX "device_scans_resolvedStudentId_idx" ON "device_scans"("resolvedStudentId");

-- CreateIndex: SchoolEntry → Device
CREATE INDEX "school_entries_deviceId_idx" ON "school_entries"("deviceId");

-- AddForeignKey
ALTER TABLE "device_scans" ADD CONSTRAINT "device_scans_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_scans" ADD CONSTRAINT "device_scans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: school_entries.deviceId (column already exists from the split migration)
ALTER TABLE "school_entries" ADD CONSTRAINT "school_entries_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
