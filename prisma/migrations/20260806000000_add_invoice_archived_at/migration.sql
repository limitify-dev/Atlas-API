-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "invoices_archivedAt_idx" ON "invoices"("archivedAt");
