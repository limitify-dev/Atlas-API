/*
  Warnings:

  - You are about to drop the column `date` on the `attendances` table. All the data in the column will be lost.
  - You are about to drop the `registration_tokens` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `requestedById` to the `permissions` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PermissionType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateEnum
CREATE TYPE "PermissionRequestedBy" AS ENUM ('ADMIN', 'TEACHER', 'PARENT');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('ACTIVE', 'IN_PROGRESS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "PointTransactionType" AS ENUM ('DEDUCTION', 'ADDITION', 'RESET', 'INITIAL');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'RESTRICTED', 'BANNED', 'LOST', 'DAMAGED');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('STUDENT', 'TEACHER', 'STAFF', 'VISITOR');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'OFFLINE');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('EDGE_DEVICE', 'BIOMETRIC_SCANNER', 'CAMERA', 'OTHER');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EducationLevel" ADD VALUE 'NURSERY';
ALTER TYPE "EducationLevel" ADD VALUE 'PRIMARY';

-- AlterEnum
ALTER TYPE "PermissionStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'DOS';
ALTER TYPE "Role" ADD VALUE 'DM';
ALTER TYPE "Role" ADD VALUE 'TEACHER';
ALTER TYPE "Role" ADD VALUE 'STUDENT';
ALTER TYPE "Role" ADD VALUE 'PARENT';

-- AlterEnum
ALTER TYPE "SchoolLevel" ADD VALUE 'NURSERY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UserType" ADD VALUE 'DOS';
ALTER TYPE "UserType" ADD VALUE 'DM';

-- DropForeignKey
ALTER TABLE "conduct_records" DROP CONSTRAINT "conduct_records_reportedBy_fkey";

-- DropForeignKey
ALTER TABLE "registration_tokens" DROP CONSTRAINT "registration_tokens_tenantId_fkey";

-- DropIndex
DROP INDEX "attendances_date_idx";

-- DropIndex
DROP INDEX "attendances_tenantId_studentId_date_key";

-- DropIndex
DROP INDEX "grades_name_idx";

-- DropIndex
DROP INDEX "grades_tenantId_name_key";

-- AlterTable
ALTER TABLE "attendances" DROP COLUMN "date",
ADD COLUMN     "checkInTime" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "conduct_records" ADD COLUMN     "incidentStatus" "IncidentStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "pointsDeducted" INTEGER,
ADD COLUMN     "reportedByUserId" TEXT,
ADD COLUMN     "resolutionNotes" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedBy" TEXT,
ALTER COLUMN "reportedBy" DROP NOT NULL;

-- AlterTable
ALTER TABLE "permissions" ADD COLUMN     "fromTime" TEXT,
ADD COLUMN     "permissionType" "PermissionType" NOT NULL DEFAULT 'ONE_TIME',
ADD COLUMN     "qrCode" TEXT,
ADD COLUMN     "qrCodeUsed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requestedBy" "PermissionRequestedBy" NOT NULL DEFAULT 'ADMIN',
ADD COLUMN     "requestedById" TEXT NOT NULL,
ADD COLUMN     "schedule" JSONB,
ADD COLUMN     "title" TEXT,
ADD COLUMN     "toTime" TEXT,
ADD COLUMN     "usedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "teachers" ADD COLUMN     "department" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "brandColor" TEXT DEFAULT '#1e40af',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- DropTable
DROP TABLE "registration_tokens";

-- CreateTable
CREATE TABLE "teacher_attendances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkInTime" TIMESTAMP(3),
    "checkOutTime" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permission_usages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkoutTime" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "cardLogId" TEXT,

    CONSTRAINT "permission_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_conduct_points" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "currentPoints" INTEGER NOT NULL DEFAULT 100,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_conduct_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conduct_point_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentConductPointsId" TEXT NOT NULL,
    "conductRecordId" TEXT,
    "transactionType" "PointTransactionType" NOT NULL,
    "pointsChange" INTEGER NOT NULL,
    "pointsBefore" INTEGER NOT NULL,
    "pointsAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conduct_point_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "cardType" "CardType" NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'INACTIVE',
    "issuedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "studentId" TEXT,
    "teacherId" TEXT,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_permissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "isGranted" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" "DeviceType" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "apiKey" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "status" "DeviceStatus" NOT NULL DEFAULT 'INACTIVE',
    "lastSeenAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "ipAddress" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" "LogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT,
    "tenantId" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "endpoint" TEXT,
    "method" TEXT,
    "statusCode" INTEGER,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teacher_attendances_tenantId_idx" ON "teacher_attendances"("tenantId");

-- CreateIndex
CREATE INDEX "teacher_attendances_teacherId_idx" ON "teacher_attendances"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_attendances_status_idx" ON "teacher_attendances"("status");

-- CreateIndex
CREATE INDEX "teacher_attendances_createdAt_idx" ON "teacher_attendances"("createdAt");

-- CreateIndex
CREATE INDEX "teacher_attendances_tenantId_teacherId_createdAt_idx" ON "teacher_attendances"("tenantId", "teacherId", "createdAt");

-- CreateIndex
CREATE INDEX "permission_usages_tenantId_idx" ON "permission_usages"("tenantId");

-- CreateIndex
CREATE INDEX "permission_usages_permissionId_idx" ON "permission_usages"("permissionId");

-- CreateIndex
CREATE INDEX "permission_usages_usedAt_idx" ON "permission_usages"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_conduct_points_studentId_key" ON "student_conduct_points"("studentId");

-- CreateIndex
CREATE INDEX "student_conduct_points_tenantId_idx" ON "student_conduct_points"("tenantId");

-- CreateIndex
CREATE INDEX "student_conduct_points_currentPoints_idx" ON "student_conduct_points"("currentPoints");

-- CreateIndex
CREATE INDEX "conduct_point_transactions_tenantId_idx" ON "conduct_point_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "conduct_point_transactions_studentConductPointsId_idx" ON "conduct_point_transactions"("studentConductPointsId");

-- CreateIndex
CREATE INDEX "conduct_point_transactions_conductRecordId_idx" ON "conduct_point_transactions"("conductRecordId");

-- CreateIndex
CREATE INDEX "conduct_point_transactions_recordedAt_idx" ON "conduct_point_transactions"("recordedAt");

-- CreateIndex
CREATE INDEX "conduct_point_transactions_transactionType_idx" ON "conduct_point_transactions"("transactionType");

-- CreateIndex
CREATE UNIQUE INDEX "cards_studentId_key" ON "cards"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "cards_teacherId_key" ON "cards"("teacherId");

-- CreateIndex
CREATE INDEX "cards_tenantId_idx" ON "cards"("tenantId");

-- CreateIndex
CREATE INDEX "cards_cardNumber_idx" ON "cards"("cardNumber");

-- CreateIndex
CREATE INDEX "cards_studentId_idx" ON "cards"("studentId");

-- CreateIndex
CREATE INDEX "cards_teacherId_idx" ON "cards"("teacherId");

-- CreateIndex
CREATE INDEX "cards_status_idx" ON "cards"("status");

-- CreateIndex
CREATE INDEX "cards_cardType_idx" ON "cards"("cardType");

-- CreateIndex
CREATE UNIQUE INDEX "cards_tenantId_cardNumber_key" ON "cards"("tenantId", "cardNumber");

-- CreateIndex
CREATE INDEX "card_logs_tenantId_idx" ON "card_logs"("tenantId");

-- CreateIndex
CREATE INDEX "card_logs_cardId_idx" ON "card_logs"("cardId");

-- CreateIndex
CREATE INDEX "card_logs_action_idx" ON "card_logs"("action");

-- CreateIndex
CREATE INDEX "card_logs_createdAt_idx" ON "card_logs"("createdAt");

-- CreateIndex
CREATE INDEX "card_permissions_tenantId_idx" ON "card_permissions"("tenantId");

-- CreateIndex
CREATE INDEX "card_permissions_cardId_idx" ON "card_permissions"("cardId");

-- CreateIndex
CREATE INDEX "card_permissions_permission_idx" ON "card_permissions"("permission");

-- CreateIndex
CREATE INDEX "card_permissions_isGranted_idx" ON "card_permissions"("isGranted");

-- CreateIndex
CREATE UNIQUE INDEX "devices_apiKey_key" ON "devices"("apiKey");

-- CreateIndex
CREATE INDEX "devices_tenantId_idx" ON "devices"("tenantId");

-- CreateIndex
CREATE INDEX "devices_apiKey_idx" ON "devices"("apiKey");

-- CreateIndex
CREATE INDEX "devices_status_idx" ON "devices"("status");

-- CreateIndex
CREATE INDEX "devices_deviceType_idx" ON "devices"("deviceType");

-- CreateIndex
CREATE INDEX "devices_lastSeenAt_idx" ON "devices"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "devices_tenantId_name_key" ON "devices"("tenantId", "name");

-- CreateIndex
CREATE INDEX "device_logs_tenantId_idx" ON "device_logs"("tenantId");

-- CreateIndex
CREATE INDEX "device_logs_deviceId_idx" ON "device_logs"("deviceId");

-- CreateIndex
CREATE INDEX "device_logs_action_idx" ON "device_logs"("action");

-- CreateIndex
CREATE INDEX "device_logs_createdAt_idx" ON "device_logs"("createdAt");

-- CreateIndex
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");

-- CreateIndex
CREATE INDEX "system_logs_tenantId_idx" ON "system_logs"("tenantId");

-- CreateIndex
CREATE INDEX "system_logs_userId_idx" ON "system_logs"("userId");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");

-- CreateIndex
CREATE INDEX "system_logs_endpoint_idx" ON "system_logs"("endpoint");

-- CreateIndex
CREATE INDEX "attendances_createdAt_idx" ON "attendances"("createdAt");

-- CreateIndex
CREATE INDEX "attendances_tenantId_studentId_createdAt_idx" ON "attendances"("tenantId", "studentId", "createdAt");

-- CreateIndex
CREATE INDEX "conduct_records_incidentStatus_idx" ON "conduct_records"("incidentStatus");

-- CreateIndex
CREATE INDEX "permissions_permissionType_idx" ON "permissions"("permissionType");

-- CreateIndex
CREATE INDEX "permissions_fromDate_toDate_idx" ON "permissions"("fromDate", "toDate");

-- CreateIndex
CREATE INDEX "permissions_qrCodeUsed_idx" ON "permissions"("qrCodeUsed");

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_usages" ADD CONSTRAINT "permission_usages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permission_usages" ADD CONSTRAINT "permission_usages_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_records" ADD CONSTRAINT "conduct_records_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_records" ADD CONSTRAINT "conduct_records_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_conduct_points" ADD CONSTRAINT "student_conduct_points_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_conduct_points" ADD CONSTRAINT "student_conduct_points_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_point_transactions" ADD CONSTRAINT "conduct_point_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_point_transactions" ADD CONSTRAINT "conduct_point_transactions_studentConductPointsId_fkey" FOREIGN KEY ("studentConductPointsId") REFERENCES "student_conduct_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_point_transactions" ADD CONSTRAINT "conduct_point_transactions_conductRecordId_fkey" FOREIGN KEY ("conductRecordId") REFERENCES "conduct_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_logs" ADD CONSTRAINT "card_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_logs" ADD CONSTRAINT "card_logs_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_permissions" ADD CONSTRAINT "card_permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_permissions" ADD CONSTRAINT "card_permissions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_logs" ADD CONSTRAINT "device_logs_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
