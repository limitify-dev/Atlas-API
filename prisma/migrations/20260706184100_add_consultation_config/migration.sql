-- CreateTable
CREATE TABLE "consultation_configs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "consultationDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 15,
    "defaultLocation" TEXT NOT NULL DEFAULT 'School Campus',
    "title" TEXT NOT NULL DEFAULT 'Consultation Day',
    "content" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation_teacher_overrides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "location" TEXT,
    "durationMinutes" INTEGER,

    CONSTRAINT "consultation_teacher_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consultation_configs_tenantId_idx" ON "consultation_configs"("tenantId");

-- CreateIndex
CREATE INDEX "consultation_teacher_overrides_tenantId_idx" ON "consultation_teacher_overrides"("tenantId");

-- CreateIndex
CREATE INDEX "consultation_teacher_overrides_teacherId_idx" ON "consultation_teacher_overrides"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_teacher_overrides_configId_teacherId_key" ON "consultation_teacher_overrides"("configId", "teacherId");

-- AddForeignKey
ALTER TABLE "consultation_teacher_overrides" ADD CONSTRAINT "consultation_teacher_overrides_configId_fkey" FOREIGN KEY ("configId") REFERENCES "consultation_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_teacher_overrides" ADD CONSTRAINT "consultation_teacher_overrides_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
