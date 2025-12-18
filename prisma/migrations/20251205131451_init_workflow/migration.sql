/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('TEACHER', 'STUDENT', 'PARENT', 'STAFF');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'PREMIUM', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('AVAILABLE', 'ISSUED', 'RESERVED', 'DAMAGED', 'LOST');

-- CreateEnum
CREATE TYPE "BusStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ConductType" AS ENUM ('WARNING', 'SUSPENSION', 'PRAISE', 'DETENTION');

-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "logo" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "zipCode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "subscriptionPlan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "subscriptionStartDate" TIMESTAMP(3),
    "subscriptionEndDate" TIMESTAMP(3),
    "maxStudents" INTEGER NOT NULL DEFAULT 100,
    "maxTeachers" INTEGER NOT NULL DEFAULT 20,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT,
    "avatar" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "userType" "UserType",
    "status" "Status" NOT NULL DEFAULT 'PENDING',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "gender" "Gender" NOT NULL,
    "bloodGroup" TEXT,
    "nationality" TEXT,
    "address" TEXT,
    "photoUrl" TEXT,
    "rollNumber" TEXT,
    "admissionDate" TIMESTAMP(3) NOT NULL,
    "gradeId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "relationship" TEXT,
    "occupation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_parents" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3),
    "gender" "Gender",
    "qualification" TEXT,
    "specialization" TEXT,
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "gradeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_teachers" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subject_teachers" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subject_teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "isbn" TEXT NOT NULL,
    "publisher" TEXT,
    "publicationYear" INTEGER,
    "category" TEXT NOT NULL,
    "totalCopies" INTEGER NOT NULL DEFAULT 1,
    "availableCopies" INTEGER NOT NULL DEFAULT 1,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "BookStatus" NOT NULL DEFAULT 'AVAILABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "returnDate" TIMESTAMP(3),
    "fine" DOUBLE PRECISION DEFAULT 0,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "driver" TEXT NOT NULL,
    "driverContact" TEXT NOT NULL,
    "status" "BusStatus" NOT NULL DEFAULT 'ACTIVE',
    "registrationNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus_routes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "busId" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "routeNumber" TEXT NOT NULL,
    "startPoint" TEXT NOT NULL,
    "endPoint" TEXT NOT NULL,
    "stops" JSONB NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bus_routes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_assignments" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "pickupPoint" TEXT NOT NULL,
    "dropoffPoint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "PermissionStatus" NOT NULL DEFAULT 'PENDING',
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conduct_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "type" "ConductType" NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedBy" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conduct_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT,
    "announcementId" TEXT,
    "userId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "organizer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_subscriptionPlan_idx" ON "tenants"("subscriptionPlan");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_userType_idx" ON "users"("userType");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_token_idx" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE INDEX "students_tenantId_idx" ON "students"("tenantId");

-- CreateIndex
CREATE INDEX "students_userId_idx" ON "students"("userId");

-- CreateIndex
CREATE INDEX "students_studentId_idx" ON "students"("studentId");

-- CreateIndex
CREATE INDEX "students_gradeId_idx" ON "students"("gradeId");

-- CreateIndex
CREATE INDEX "students_sectionId_idx" ON "students"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenantId_studentId_key" ON "students"("tenantId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "parents_userId_key" ON "parents"("userId");

-- CreateIndex
CREATE INDEX "parents_tenantId_idx" ON "parents"("tenantId");

-- CreateIndex
CREATE INDEX "parents_userId_idx" ON "parents"("userId");

-- CreateIndex
CREATE INDEX "student_parents_studentId_idx" ON "student_parents"("studentId");

-- CreateIndex
CREATE INDEX "student_parents_parentId_idx" ON "student_parents"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "student_parents_studentId_parentId_key" ON "student_parents"("studentId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_userId_key" ON "teachers"("userId");

-- CreateIndex
CREATE INDEX "teachers_tenantId_idx" ON "teachers"("tenantId");

-- CreateIndex
CREATE INDEX "teachers_userId_idx" ON "teachers"("userId");

-- CreateIndex
CREATE INDEX "teachers_teacherId_idx" ON "teachers"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "teachers_tenantId_teacherId_key" ON "teachers"("tenantId", "teacherId");

-- CreateIndex
CREATE INDEX "grades_tenantId_idx" ON "grades"("tenantId");

-- CreateIndex
CREATE INDEX "grades_name_idx" ON "grades"("name");

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenantId_name_key" ON "grades"("tenantId", "name");

-- CreateIndex
CREATE INDEX "sections_tenantId_idx" ON "sections"("tenantId");

-- CreateIndex
CREATE INDEX "sections_gradeId_idx" ON "sections"("gradeId");

-- CreateIndex
CREATE UNIQUE INDEX "sections_tenantId_gradeId_name_key" ON "sections"("tenantId", "gradeId", "name");

-- CreateIndex
CREATE INDEX "subjects_tenantId_idx" ON "subjects"("tenantId");

-- CreateIndex
CREATE INDEX "subjects_gradeId_idx" ON "subjects"("gradeId");

-- CreateIndex
CREATE INDEX "subjects_code_idx" ON "subjects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_tenantId_code_key" ON "subjects"("tenantId", "code");

-- CreateIndex
CREATE INDEX "class_teachers_teacherId_idx" ON "class_teachers"("teacherId");

-- CreateIndex
CREATE INDEX "class_teachers_sectionId_idx" ON "class_teachers"("sectionId");

-- CreateIndex
CREATE UNIQUE INDEX "class_teachers_teacherId_sectionId_key" ON "class_teachers"("teacherId", "sectionId");

-- CreateIndex
CREATE INDEX "subject_teachers_teacherId_idx" ON "subject_teachers"("teacherId");

-- CreateIndex
CREATE INDEX "subject_teachers_subjectId_idx" ON "subject_teachers"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "subject_teachers_teacherId_subjectId_key" ON "subject_teachers"("teacherId", "subjectId");

-- CreateIndex
CREATE INDEX "attendances_tenantId_idx" ON "attendances"("tenantId");

-- CreateIndex
CREATE INDEX "attendances_studentId_idx" ON "attendances"("studentId");

-- CreateIndex
CREATE INDEX "attendances_date_idx" ON "attendances"("date");

-- CreateIndex
CREATE INDEX "attendances_status_idx" ON "attendances"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_tenantId_studentId_date_key" ON "attendances"("tenantId", "studentId", "date");

-- CreateIndex
CREATE INDEX "books_tenantId_idx" ON "books"("tenantId");

-- CreateIndex
CREATE INDEX "books_isbn_idx" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_category_idx" ON "books"("category");

-- CreateIndex
CREATE INDEX "books_status_idx" ON "books"("status");

-- CreateIndex
CREATE UNIQUE INDEX "books_tenantId_isbn_key" ON "books"("tenantId", "isbn");

-- CreateIndex
CREATE INDEX "book_transactions_tenantId_idx" ON "book_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "book_transactions_bookId_idx" ON "book_transactions"("bookId");

-- CreateIndex
CREATE INDEX "book_transactions_studentId_idx" ON "book_transactions"("studentId");

-- CreateIndex
CREATE INDEX "book_transactions_issueDate_idx" ON "book_transactions"("issueDate");

-- CreateIndex
CREATE INDEX "book_transactions_returnDate_idx" ON "book_transactions"("returnDate");

-- CreateIndex
CREATE INDEX "buses_tenantId_idx" ON "buses"("tenantId");

-- CreateIndex
CREATE INDEX "buses_busNumber_idx" ON "buses"("busNumber");

-- CreateIndex
CREATE INDEX "buses_status_idx" ON "buses"("status");

-- CreateIndex
CREATE UNIQUE INDEX "buses_tenantId_busNumber_key" ON "buses"("tenantId", "busNumber");

-- CreateIndex
CREATE UNIQUE INDEX "buses_tenantId_registrationNumber_key" ON "buses"("tenantId", "registrationNumber");

-- CreateIndex
CREATE INDEX "bus_routes_tenantId_idx" ON "bus_routes"("tenantId");

-- CreateIndex
CREATE INDEX "bus_routes_busId_idx" ON "bus_routes"("busId");

-- CreateIndex
CREATE INDEX "bus_routes_routeNumber_idx" ON "bus_routes"("routeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bus_routes_tenantId_routeNumber_key" ON "bus_routes"("tenantId", "routeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "transport_assignments_studentId_key" ON "transport_assignments"("studentId");

-- CreateIndex
CREATE INDEX "transport_assignments_tenantId_idx" ON "transport_assignments"("tenantId");

-- CreateIndex
CREATE INDEX "transport_assignments_studentId_idx" ON "transport_assignments"("studentId");

-- CreateIndex
CREATE INDEX "transport_assignments_routeId_idx" ON "transport_assignments"("routeId");

-- CreateIndex
CREATE INDEX "permissions_tenantId_idx" ON "permissions"("tenantId");

-- CreateIndex
CREATE INDEX "permissions_studentId_idx" ON "permissions"("studentId");

-- CreateIndex
CREATE INDEX "permissions_status_idx" ON "permissions"("status");

-- CreateIndex
CREATE INDEX "conduct_records_tenantId_idx" ON "conduct_records"("tenantId");

-- CreateIndex
CREATE INDEX "conduct_records_studentId_idx" ON "conduct_records"("studentId");

-- CreateIndex
CREATE INDEX "conduct_records_type_idx" ON "conduct_records"("type");

-- CreateIndex
CREATE INDEX "conduct_records_date_idx" ON "conduct_records"("date");

-- CreateIndex
CREATE INDEX "messages_tenantId_idx" ON "messages"("tenantId");

-- CreateIndex
CREATE INDEX "messages_senderId_idx" ON "messages"("senderId");

-- CreateIndex
CREATE INDEX "messages_receiverId_idx" ON "messages"("receiverId");

-- CreateIndex
CREATE INDEX "messages_isRead_idx" ON "messages"("isRead");

-- CreateIndex
CREATE INDEX "announcements_tenantId_idx" ON "announcements"("tenantId");

-- CreateIndex
CREATE INDEX "announcements_publishedBy_idx" ON "announcements"("publishedBy");

-- CreateIndex
CREATE INDEX "announcements_publishedAt_idx" ON "announcements"("publishedAt");

-- CreateIndex
CREATE INDEX "notifications_tenantId_idx" ON "notifications"("tenantId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_idx" ON "notification_recipients"("userId");

-- CreateIndex
CREATE INDEX "notification_recipients_isRead_idx" ON "notification_recipients"("isRead");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_idx" ON "inventory_items"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_items_category_idx" ON "inventory_items"("category");

-- CreateIndex
CREATE INDEX "inventory_items_quantity_idx" ON "inventory_items"("quantity");

-- CreateIndex
CREATE INDEX "inventory_transactions_tenantId_idx" ON "inventory_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "inventory_transactions_itemId_idx" ON "inventory_transactions"("itemId");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");

-- CreateIndex
CREATE INDEX "inventory_transactions_createdAt_idx" ON "inventory_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "events_tenantId_idx" ON "events"("tenantId");

-- CreateIndex
CREATE INDEX "events_eventDate_idx" ON "events"("eventDate");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents" ADD CONSTRAINT "parents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_parents" ADD CONSTRAINT "student_parents_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subject_teachers" ADD CONSTRAINT "subject_teachers_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_transactions" ADD CONSTRAINT "book_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buses" ADD CONSTRAINT "buses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_routes" ADD CONSTRAINT "bus_routes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus_routes" ADD CONSTRAINT "bus_routes_busId_fkey" FOREIGN KEY ("busId") REFERENCES "buses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_assignments" ADD CONSTRAINT "transport_assignments_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "bus_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_records" ADD CONSTRAINT "conduct_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_records" ADD CONSTRAINT "conduct_records_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conduct_records" ADD CONSTRAINT "conduct_records_reportedBy_fkey" FOREIGN KEY ("reportedBy") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_publishedBy_fkey" FOREIGN KEY ("publishedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
