-- NOTE: the `feedback` feature (its enums + table) was originally introduced
-- via `prisma db push`, so it was missing from migration history and this
-- migration (which only ALTERs it) failed to replay on a fresh database.
-- The statements below recreate that missing state idempotently, so a clean
-- `migrate deploy` succeeds while remaining a no-op on databases that already
-- have the table.

-- Feedback enums (idempotent)
DO $$ BEGIN
  CREATE TYPE "FeedbackCategory" AS ENUM ('BUG', 'SUGGESTION', 'COMPLAINT', 'OTHER');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWED', 'RESOLVED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Feedback table (idempotent)
CREATE TABLE IF NOT EXISTS "feedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feedback_tenantId_idx" ON "feedback"("tenantId");
CREATE INDEX IF NOT EXISTS "feedback_status_idx" ON "feedback"("status");
CREATE INDEX IF NOT EXISTS "feedback_category_idx" ON "feedback"("category");

DO $$ BEGIN
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "feedback" ADD CONSTRAINT "feedback_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AlterTable
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "priority" "FeedbackPriority" NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "plannedRelease" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "feedback_priority_idx" ON "feedback"("priority");
