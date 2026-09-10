-- Smart Attendance & Reporting — Phase 7: materialised per-student daily cycle.

-- CreateTable
CREATE TABLE "student_attendance_days" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "campusStatus" "AttendanceStatus" NOT NULL,
    "firstInAt" TIMESTAMP(3),
    "lastOutAt" TIMESTAMP(3),
    "checkInMethod" "AttendanceMethod",
    "periodsExpected" INTEGER NOT NULL DEFAULT 0,
    "periodsPresent" INTEGER NOT NULL DEFAULT 0,
    "periodsAbsent" INTEGER NOT NULL DEFAULT 0,
    "cycleComplete" BOOLEAN NOT NULL DEFAULT false,
    "truancyFlag" BOOLEAN NOT NULL DEFAULT false,
    "unaccounted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "student_attendance_days_tenantId_studentId_date_key" ON "student_attendance_days"("tenantId", "studentId", "date");
CREATE INDEX "student_attendance_days_tenantId_date_idx" ON "student_attendance_days"("tenantId", "date");
CREATE INDEX "student_attendance_days_tenantId_date_truancyFlag_idx" ON "student_attendance_days"("tenantId", "date", "truancyFlag");
CREATE INDEX "student_attendance_days_studentId_date_idx" ON "student_attendance_days"("studentId", "date");

-- AddForeignKey
ALTER TABLE "student_attendance_days" ADD CONSTRAINT "student_attendance_days_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_attendance_days" ADD CONSTRAINT "student_attendance_days_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
