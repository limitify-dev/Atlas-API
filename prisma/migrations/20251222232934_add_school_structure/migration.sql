-- CreateEnum
CREATE TYPE "SchoolLevel" AS ENUM ('PRIMARY', 'SENIOR');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('ORDINARY', 'ADVANCED');

-- AlterTable: Add new columns to grades table
ALTER TABLE "grades"
ADD COLUMN "code" TEXT,
ADD COLUMN "schoolLevel" "SchoolLevel",
ADD COLUMN "educationLevel" "EducationLevel";

-- Update existing grades with default values (you may need to adjust these)
-- This sets all existing grades to SENIOR and ORDINARY level with a generated code
UPDATE "grades"
SET "code" = name,
    "schoolLevel" = 'SENIOR',
    "educationLevel" = 'ORDINARY'
WHERE "code" IS NULL;

-- Make the new columns required
ALTER TABLE "grades"
ALTER COLUMN "code" SET NOT NULL,
ALTER COLUMN "schoolLevel" SET NOT NULL,
ALTER COLUMN "educationLevel" SET NOT NULL;

-- CreateTable: Combination
CREATE TABLE "combinations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gradeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "subjectIds" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combinations_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add new columns to sections table
ALTER TABLE "sections"
ADD COLUMN "combinationId" TEXT,
ADD COLUMN "division" TEXT,
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "grades_tenantId_code_key" ON "grades"("tenantId", "code");

-- CreateIndex
CREATE INDEX "grades_code_idx" ON "grades"("code");

-- CreateIndex
CREATE INDEX "grades_schoolLevel_idx" ON "grades"("schoolLevel");

-- CreateIndex
CREATE INDEX "grades_educationLevel_idx" ON "grades"("educationLevel");

-- CreateIndex
CREATE UNIQUE INDEX "combinations_tenantId_gradeId_code_key" ON "combinations"("tenantId", "gradeId", "code");

-- CreateIndex
CREATE INDEX "combinations_tenantId_idx" ON "combinations"("tenantId");

-- CreateIndex
CREATE INDEX "combinations_gradeId_idx" ON "combinations"("gradeId");

-- CreateIndex
CREATE INDEX "combinations_code_idx" ON "combinations"("code");

-- CreateIndex
CREATE INDEX "sections_combinationId_idx" ON "sections"("combinationId");

-- AddForeignKey
ALTER TABLE "combinations" ADD CONSTRAINT "combinations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combinations" ADD CONSTRAINT "combinations_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "combinations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
