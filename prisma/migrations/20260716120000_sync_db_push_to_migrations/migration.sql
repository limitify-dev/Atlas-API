-- Catch-up migration: brings migration history in line with the schema.
-- A large part of the app (finance, chat, moments, academics, polls,
-- subscriptions, timetable, report-card PDF fields, etc.) had been applied
-- via 'prisma db push' and was missing from migrations. Generated with
-- 'prisma migrate diff' (two redundant enum-swap ALTERs on not-yet-created
-- invites/admin_invites tables removed). Mark as already-applied on
-- environments built with db push.

-- CreateEnum
CREATE TYPE "OnboardingMode" AS ENUM ('OTP', 'PASSWORD');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('LOGIN', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');

-- CreateEnum
CREATE TYPE "ConversationRole" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AnnouncementStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DRAFT');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('ACTIVE', 'CLOSED', 'DRAFT');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PushPlatform" AS ENUM ('EXPO', 'FCM_WEB');

-- CreateEnum
CREATE TYPE "AcademicRecordStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AssignmentResultStatus" AS ENUM ('PENDING', 'GRADED', 'MISSING');

-- CreateEnum
CREATE TYPE "AssignmentType" AS ENUM ('HOMEWORK', 'CLASSWORK', 'QUIZ', 'TEST', 'PROJECT', 'EXAM');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PENDING_VERIFICATION', 'PAID', 'REJECTED', 'CANCELLED', 'OVERDUE', 'PARTIALLY_PAID');

-- CreateEnum
CREATE TYPE "PaymentSubmissionStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PaymentPromiseStatus" AS ENUM ('ACTIVE', 'APPROVED', 'REFUSED', 'FULFILLED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AcademicWindowType" AS ENUM ('TERM', 'EXAM', 'GRADE_SUBMISSION', 'REPORT_PUBLICATION', 'ENROLLMENT', 'HOLIDAY', 'CONSULTATION', 'ASSIGNMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "AcademicWindowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdminInviteStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'TERMLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'PAID', 'OVERDUE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STAFF', 'PARENT');
ALTER TABLE "public"."users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "public"."Role_old";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'STAFF';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "UserType_new" AS ENUM ('TEACHER', 'STAFF', 'PARENT');
ALTER TABLE "users" ALTER COLUMN "userType" TYPE "UserType_new" USING ("userType"::text::"UserType_new");
ALTER TYPE "UserType" RENAME TO "UserType_old";
ALTER TYPE "UserType_new" RENAME TO "UserType";
DROP TYPE "public"."UserType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "bus_routes" DROP CONSTRAINT "bus_routes_busId_fkey";

-- DropForeignKey
ALTER TABLE "bus_routes" DROP CONSTRAINT "bus_routes_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "buses" DROP CONSTRAINT "buses_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_itemId_fkey";

-- DropForeignKey
ALTER TABLE "inventory_transactions" DROP CONSTRAINT "inventory_transactions_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "transport_assignments" DROP CONSTRAINT "transport_assignments_routeId_fkey";

-- DropForeignKey
ALTER TABLE "transport_assignments" DROP CONSTRAINT "transport_assignments_studentId_fkey";

-- DropForeignKey
ALTER TABLE "transport_assignments" DROP CONSTRAINT "transport_assignments_tenantId_fkey";

-- AlterTable
ALTER TABLE "announcements" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "ctaLabel" TEXT,
ADD COLUMN     "ctaType" TEXT,
ADD COLUMN     "ctaUrl" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status" "AnnouncementStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "book_transactions" ADD COLUMN     "bookCopyId" TEXT,
ADD COLUMN     "sectionId" TEXT,
ALTER COLUMN "studentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "price" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "consultation_configs" ADD COLUMN     "breakDurationMinutes" INTEGER DEFAULT 0,
ADD COLUMN     "breakStartTime" TEXT,
ADD COLUMN     "sectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'ALL',
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'Academic',
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "gradeTarget" TEXT,
ADD COLUMN     "time" TEXT;

-- AlterTable
ALTER TABLE "sections" ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "promotionId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "role" SET DEFAULT 'STAFF';

-- DropTable
DROP TABLE "bus_routes";

-- DropTable
DROP TABLE "buses";

-- DropTable
DROP TABLE "inventory_items";

-- DropTable
DROP TABLE "inventory_transactions";

-- DropTable
DROP TABLE "transport_assignments";

-- DropEnum
DROP TYPE "BusStatus";

-- CreateTable
CREATE TABLE "timetable_periods" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isBreak" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timetable_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "subjectId" TEXT,
    "teacherId" TEXT,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timetable_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_copies" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shelf" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_copies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'DIRECT',
    "name" TEXT,
    "description" TEXT,
    "avatar" TEXT,
    "sectionId" TEXT,
    "createdBy" TEXT,
    "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastMessageAt" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ConversationRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "isMuted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL,
    "deviceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "caption" TEXT,
    "sectionId" TEXT,
    "classLabel" TEXT,
    "photoUrls" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moment_likes" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_exams" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "term" TEXT,
    "examDate" TIMESTAMP(3) NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "subjectId" TEXT,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "courseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "term" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT,
    "subjectId" TEXT,
    "maxScore" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "type" TEXT DEFAULT 'HOMEWORK',

    CONSTRAINT "academic_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_courses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "term" TEXT,
    "description" TEXT,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_assignment_results" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "remarks" TEXT,
    "submittedAt" TIMESTAMP(3),
    "gradedAt" TIMESTAMP(3),
    "status" "AssignmentResultStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_assignment_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_report_cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION,
    "grade" TEXT,
    "remarks" TEXT,
    "fileUrl" TEXT,
    "fileName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT NOT NULL,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_bookings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "consultationDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "parentId" TEXT,
    "sectionId" TEXT,
    "location" TEXT,
    "announcementId" TEXT,
    "notes" TEXT,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_timelines" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AcademicWindowType" NOT NULL,
    "academicYear" TEXT NOT NULL,
    "term" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "gradeIds" JSONB,
    "status" "AcademicWindowStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_timelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryYear" INTEGER NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "department" TEXT,
    "staffRole" TEXT NOT NULL,
    "photoUrl" TEXT,
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_grades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "term" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,
    "comment" TEXT,
    "gradedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "term" TEXT,
    "category" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedBy" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "amountPaid" DECIMAL(10,2),
    "paymentMethod" TEXT,
    "gracePeriodApproved" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_submissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "proofUrl" TEXT,
    "note" TEXT,
    "amountClaimed" DECIMAL(10,2),
    "status" "PaymentSubmissionStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_promises" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "promisedBy" TEXT NOT NULL,
    "promisedDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "status" "PaymentPromiseStatus" NOT NULL DEFAULT 'ACTIVE',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_promises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL,
    "referenceId" TEXT,
    "token" TEXT NOT NULL,
    "onboardingMode" "OnboardingMode" NOT NULL DEFAULT 'OTP',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tenantId" TEXT,
    "inviteToken" TEXT,
    "purpose" "OtpPurpose" NOT NULL DEFAULT 'ONBOARDING',
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "status" "PollStatus" NOT NULL DEFAULT 'ACTIVE',
    "allowMultiple" BOOLEAN NOT NULL DEFAULT false,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_options" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_votes" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_modules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studio_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "studio_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'BASIC',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "studio_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_invites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "status" "AdminInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_billings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_approvals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "AdminApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "admin_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "timetable_periods_tenantId_idx" ON "timetable_periods"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_periods_tenantId_orderIndex_key" ON "timetable_periods"("tenantId", "orderIndex");

-- CreateIndex
CREATE INDEX "timetable_entries_tenantId_idx" ON "timetable_entries"("tenantId");

-- CreateIndex
CREATE INDEX "timetable_entries_sectionId_idx" ON "timetable_entries"("sectionId");

-- CreateIndex
CREATE INDEX "timetable_entries_teacherId_idx" ON "timetable_entries"("teacherId");

-- CreateIndex
CREATE INDEX "timetable_entries_periodId_idx" ON "timetable_entries"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_sectionId_dayOfWeek_periodId_key" ON "timetable_entries"("sectionId", "dayOfWeek", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "timetable_entries_teacherId_dayOfWeek_periodId_key" ON "timetable_entries"("teacherId", "dayOfWeek", "periodId");

-- CreateIndex
CREATE INDEX "book_copies_tenantId_idx" ON "book_copies"("tenantId");

-- CreateIndex
CREATE INDEX "book_copies_bookId_idx" ON "book_copies"("bookId");

-- CreateIndex
CREATE INDEX "book_copies_status_idx" ON "book_copies"("status");

-- CreateIndex
CREATE INDEX "book_copies_shelf_idx" ON "book_copies"("shelf");

-- CreateIndex
CREATE UNIQUE INDEX "book_copies_tenantId_code_key" ON "book_copies"("tenantId", "code");

-- CreateIndex
CREATE INDEX "conversations_tenantId_idx" ON "conversations"("tenantId");

-- CreateIndex
CREATE INDEX "conversations_type_idx" ON "conversations"("type");

-- CreateIndex
CREATE INDEX "conversations_sectionId_idx" ON "conversations"("sectionId");

-- CreateIndex
CREATE INDEX "conversations_lastMessageAt_idx" ON "conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "conversation_participants_userId_idx" ON "conversation_participants"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_participants_conversationId_userId_key" ON "conversation_participants"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_senderId_idx" ON "chat_messages"("senderId");

-- CreateIndex
CREATE UNIQUE INDEX "push_tokens_token_key" ON "push_tokens"("token");

-- CreateIndex
CREATE INDEX "push_tokens_userId_idx" ON "push_tokens"("userId");

-- CreateIndex
CREATE INDEX "moments_tenantId_idx" ON "moments"("tenantId");

-- CreateIndex
CREATE INDEX "moments_teacherId_idx" ON "moments"("teacherId");

-- CreateIndex
CREATE INDEX "moments_sectionId_idx" ON "moments"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "moment_likes_momentId_userId_key" ON "moment_likes"("momentId", "userId");

-- CreateIndex
CREATE INDEX "academic_exams_tenantId_idx" ON "academic_exams"("tenantId");

-- CreateIndex
CREATE INDEX "academic_exams_gradeId_idx" ON "academic_exams"("gradeId");

-- CreateIndex
CREATE INDEX "academic_exams_sectionId_idx" ON "academic_exams"("sectionId");

-- CreateIndex
CREATE INDEX "academic_exams_subjectId_idx" ON "academic_exams"("subjectId");

-- CreateIndex
CREATE INDEX "academic_exams_examDate_idx" ON "academic_exams"("examDate");

-- CreateIndex
CREATE INDEX "academic_assignments_tenantId_idx" ON "academic_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "academic_assignments_courseId_idx" ON "academic_assignments"("courseId");

-- CreateIndex
CREATE INDEX "academic_assignments_gradeId_idx" ON "academic_assignments"("gradeId");

-- CreateIndex
CREATE INDEX "academic_assignments_sectionId_idx" ON "academic_assignments"("sectionId");

-- CreateIndex
CREATE INDEX "academic_assignments_subjectId_idx" ON "academic_assignments"("subjectId");

-- CreateIndex
CREATE INDEX "academic_assignments_dueDate_idx" ON "academic_assignments"("dueDate");

-- CreateIndex
CREATE INDEX "academic_courses_tenantId_idx" ON "academic_courses"("tenantId");

-- CreateIndex
CREATE INDEX "academic_courses_teacherId_idx" ON "academic_courses"("teacherId");

-- CreateIndex
CREATE INDEX "academic_courses_sectionId_idx" ON "academic_courses"("sectionId");

-- CreateIndex
CREATE INDEX "academic_courses_subjectId_idx" ON "academic_courses"("subjectId");

-- CreateIndex
CREATE INDEX "academic_courses_status_idx" ON "academic_courses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "academic_courses_tenantId_code_key" ON "academic_courses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "academic_assignment_results_tenantId_idx" ON "academic_assignment_results"("tenantId");

-- CreateIndex
CREATE INDEX "academic_assignment_results_assignmentId_idx" ON "academic_assignment_results"("assignmentId");

-- CreateIndex
CREATE INDEX "academic_assignment_results_studentId_idx" ON "academic_assignment_results"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_assignment_results_assignmentId_studentId_key" ON "academic_assignment_results"("assignmentId", "studentId");

-- CreateIndex
CREATE INDEX "academic_report_cards_tenantId_idx" ON "academic_report_cards"("tenantId");

-- CreateIndex
CREATE INDEX "academic_report_cards_studentId_idx" ON "academic_report_cards"("studentId");

-- CreateIndex
CREATE INDEX "academic_report_cards_term_idx" ON "academic_report_cards"("term");

-- CreateIndex
CREATE UNIQUE INDEX "academic_report_cards_tenantId_studentId_term_key" ON "academic_report_cards"("tenantId", "studentId", "term");

-- CreateIndex
CREATE INDEX "consultation_bookings_tenantId_idx" ON "consultation_bookings"("tenantId");

-- CreateIndex
CREATE INDEX "consultation_bookings_consultationDate_idx" ON "consultation_bookings"("consultationDate");

-- CreateIndex
CREATE INDEX "consultation_bookings_teacherId_idx" ON "consultation_bookings"("teacherId");

-- CreateIndex
CREATE INDEX "consultation_bookings_studentId_idx" ON "consultation_bookings"("studentId");

-- CreateIndex
CREATE INDEX "consultation_bookings_parentId_idx" ON "consultation_bookings"("parentId");

-- CreateIndex
CREATE INDEX "academic_timelines_tenantId_idx" ON "academic_timelines"("tenantId");

-- CreateIndex
CREATE INDEX "academic_timelines_type_idx" ON "academic_timelines"("type");

-- CreateIndex
CREATE INDEX "academic_timelines_academicYear_idx" ON "academic_timelines"("academicYear");

-- CreateIndex
CREATE INDEX "academic_timelines_status_idx" ON "academic_timelines"("status");

-- CreateIndex
CREATE INDEX "academic_timelines_startDate_endDate_idx" ON "academic_timelines"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "academic_timelines_tenantId_type_status_idx" ON "academic_timelines"("tenantId", "type", "status");

-- CreateIndex
CREATE INDEX "promotions_tenantId_idx" ON "promotions"("tenantId");

-- CreateIndex
CREATE INDEX "promotions_entryYear_idx" ON "promotions"("entryYear");

-- CreateIndex
CREATE INDEX "promotions_isActive_idx" ON "promotions"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_tenantId_name_key" ON "promotions"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "staff_userId_key" ON "staff"("userId");

-- CreateIndex
CREATE INDEX "staff_tenantId_idx" ON "staff"("tenantId");

-- CreateIndex
CREATE INDEX "staff_staffRole_idx" ON "staff"("staffRole");

-- CreateIndex
CREATE INDEX "student_grades_tenantId_idx" ON "student_grades"("tenantId");

-- CreateIndex
CREATE INDEX "student_grades_studentId_idx" ON "student_grades"("studentId");

-- CreateIndex
CREATE INDEX "student_grades_term_idx" ON "student_grades"("term");

-- CreateIndex
CREATE UNIQUE INDEX "student_grades_tenantId_studentId_subjectId_term_key" ON "student_grades"("tenantId", "studentId", "subjectId", "term");

-- CreateIndex
CREATE INDEX "invoices_tenantId_idx" ON "invoices"("tenantId");

-- CreateIndex
CREATE INDEX "invoices_studentId_idx" ON "invoices"("studentId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_dueDate_idx" ON "invoices"("dueDate");

-- CreateIndex
CREATE INDEX "invoices_tenantId_studentId_idx" ON "invoices"("tenantId", "studentId");

-- CreateIndex
CREATE INDEX "payment_submissions_tenantId_idx" ON "payment_submissions"("tenantId");

-- CreateIndex
CREATE INDEX "payment_submissions_invoiceId_idx" ON "payment_submissions"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_submissions_status_idx" ON "payment_submissions"("status");

-- CreateIndex
CREATE INDEX "payment_promises_tenantId_idx" ON "payment_promises"("tenantId");

-- CreateIndex
CREATE INDEX "payment_promises_invoiceId_idx" ON "payment_promises"("invoiceId");

-- CreateIndex
CREATE INDEX "payment_promises_status_idx" ON "payment_promises"("status");

-- CreateIndex
CREATE INDEX "payment_promises_promisedDate_idx" ON "payment_promises"("promisedDate");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_tenantId_idx" ON "invites"("tenantId");

-- CreateIndex
CREATE INDEX "invites_token_idx" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_phone_tenantId_idx" ON "invites"("phone", "tenantId");

-- CreateIndex
CREATE INDEX "otp_codes_phone_idx" ON "otp_codes"("phone");

-- CreateIndex
CREATE INDEX "otp_codes_inviteToken_idx" ON "otp_codes"("inviteToken");

-- CreateIndex
CREATE INDEX "polls_tenantId_idx" ON "polls"("tenantId");

-- CreateIndex
CREATE INDEX "polls_status_idx" ON "polls"("status");

-- CreateIndex
CREATE INDEX "poll_options_pollId_idx" ON "poll_options"("pollId");

-- CreateIndex
CREATE INDEX "poll_votes_pollId_idx" ON "poll_votes"("pollId");

-- CreateIndex
CREATE INDEX "poll_votes_userId_idx" ON "poll_votes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "poll_votes_pollId_userId_optionId_key" ON "poll_votes"("pollId", "userId", "optionId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_modules_key_key" ON "studio_modules"("key");

-- CreateIndex
CREATE INDEX "tenant_modules_tenantId_idx" ON "tenant_modules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenantId_moduleId_key" ON "tenant_modules"("tenantId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "studio_subscriptions_tenantId_key" ON "studio_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "studio_subscriptions_status_idx" ON "studio_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_invites_token_key" ON "admin_invites"("token");

-- CreateIndex
CREATE INDEX "admin_invites_tenantId_idx" ON "admin_invites"("tenantId");

-- CreateIndex
CREATE INDEX "admin_invites_token_idx" ON "admin_invites"("token");

-- CreateIndex
CREATE INDEX "tenant_billings_tenantId_idx" ON "tenant_billings"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_billings_status_idx" ON "tenant_billings"("status");

-- CreateIndex
CREATE INDEX "tenant_billings_dueDate_idx" ON "tenant_billings"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "admin_approvals_userId_key" ON "admin_approvals"("userId");

-- CreateIndex
CREATE INDEX "admin_approvals_tenantId_idx" ON "admin_approvals"("tenantId");

-- CreateIndex
CREATE INDEX "admin_approvals_status_idx" ON "admin_approvals"("status");

-- CreateIndex
CREATE INDEX "announcements_status_idx" ON "announcements"("status");

-- CreateIndex
CREATE INDEX "book_transactions_bookCopyId_idx" ON "book_transactions"("bookCopyId");

-- CreateIndex
CREATE INDEX "book_transactions_sectionId_idx" ON "book_transactions"("sectionId");

-- CreateIndex
CREATE INDEX "events_category_idx" ON "events"("category");

-- CreateIndex
CREATE INDEX "sections_promotionId_idx" ON "sections"("promotionId");

-- CreateIndex
CREATE INDEX "students_promotionId_idx" ON "students"("promotionId");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_periods" ADD CONSTRAINT "timetable_periods_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "timetable_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_copies" ADD CONSTRAINT "book_copies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_bookCopyId_fkey" FOREIGN KEY ("bookCopyId") REFERENCES "book_copies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moments" ADD CONSTRAINT "moments_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "moments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moment_likes" ADD CONSTRAINT "moment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_timelines" ADD CONSTRAINT "academic_timelines_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_grades" ADD CONSTRAINT "student_grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_grades" ADD CONSTRAINT "student_grades_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_grades" ADD CONSTRAINT "student_grades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_submissions" ADD CONSTRAINT "payment_submissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_promises" ADD CONSTRAINT "payment_promises_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "studio_modules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studio_subscriptions" ADD CONSTRAINT "studio_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_invites" ADD CONSTRAINT "admin_invites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_billings" ADD CONSTRAINT "tenant_billings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_approvals" ADD CONSTRAINT "admin_approvals_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

