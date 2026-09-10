-- Split attendance: campus check-in/out (school_entries) vs in-class (attendances)

-- CreateEnum
CREATE TYPE "AttendanceMethod" AS ENUM ('CARD', 'DEVICE', 'MANUAL');

-- AlterTable: attendances becomes "in-class" (per section+subject+teacher+day).
-- Columns nullable so legacy rows stay valid; new writers always set them.
ALTER TABLE "attendances" ADD COLUMN     "date" DATE,
ADD COLUMN     "sectionId" TEXT,
ADD COLUMN     "subjectId" TEXT,
ADD COLUMN     "teacherId" TEXT;

-- CreateTable: school_entries = authoritative "on campus" signal
CREATE TABLE "school_entries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInMethod" "AttendanceMethod",
    "checkOutMethod" "AttendanceMethod",
    "checkInLocation" TEXT,
    "checkOutLocation" TEXT,
    "deviceId" TEXT,
    "recordedBy" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_entries_tenantId_date_idx" ON "school_entries"("tenantId", "date");

-- CreateIndex
CREATE INDEX "school_entries_studentId_idx" ON "school_entries"("studentId");

-- CreateIndex
CREATE INDEX "school_entries_status_idx" ON "school_entries"("status");

-- CreateIndex
CREATE UNIQUE INDEX "school_entries_tenantId_studentId_date_key" ON "school_entries"("tenantId", "studentId", "date");

-- CreateIndex
CREATE INDEX "attendances_tenantId_sectionId_subjectId_date_idx" ON "attendances"("tenantId", "sectionId", "subjectId", "date");

-- CreateIndex
CREATE INDEX "attendances_teacherId_date_idx" ON "attendances"("teacherId", "date");

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_entries" ADD CONSTRAINT "school_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_entries" ADD CONSTRAINT "school_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill: every existing `attendances` row is really a campus/day record
-- today. Copy it into school_entries (one per student per day; keep the
-- earliest check-in / strongest status if duplicates exist). Old rows are
-- left in place — the in-class queries filter `sectionId IS NOT NULL`.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO "school_entries" (
  "id", "tenantId", "studentId", "date", "status",
  "checkInAt", "checkInMethod", "remarks", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  s."tenantId",
  s."studentId",
  s."day"::date,
  s."status",
  s."checkInAt",
  s."method",
  s."remarks",
  s."createdAt",
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT ON (a."tenantId", a."studentId", (a."createdAt")::date)
    a."tenantId",
    a."studentId",
    (a."createdAt")::date            AS "day",
    a."status",
    COALESCE(a."checkInTime", a."createdAt") AS "checkInAt",
    CASE WHEN a."remarks" ILIKE 'Manual%' THEN 'MANUAL'::"AttendanceMethod"
         ELSE 'CARD'::"AttendanceMethod" END AS "method",
    a."remarks",
    a."createdAt"
  FROM "attendances" a
  ORDER BY
    a."tenantId", a."studentId", (a."createdAt")::date,
    -- prefer a real check-in time, then ABSENT/LATE over PRESENT, then earliest
    (a."checkInTime" IS NULL),
    CASE a."status" WHEN 'ABSENT' THEN 0 WHEN 'LATE' THEN 1 WHEN 'EXCUSED' THEN 2 ELSE 3 END,
    a."createdAt"
) s
ON CONFLICT ("tenantId", "studentId", "date") DO NOTHING;
