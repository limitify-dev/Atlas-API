-- Remove grade relationship from combinations table
-- Combinations are now tenant-level and shared across all Advanced Level grades (S4-S6)

-- Drop the existing unique constraint that includes gradeId
DROP INDEX IF EXISTS "combinations_tenantId_gradeId_code_key";

-- Drop the gradeId index
DROP INDEX IF EXISTS "combinations_gradeId_idx";

-- Drop the foreign key constraint
ALTER TABLE "combinations" DROP CONSTRAINT IF EXISTS "combinations_gradeId_fkey";

-- Remove duplicate combinations, keeping only the first occurrence of each (tenantId, code) pair
DELETE FROM "combinations" a USING "combinations" b
WHERE a."tenantId" = b."tenantId"
  AND a."code" = b."code"
  AND a."createdAt" > b."createdAt";

-- Drop the gradeId column
ALTER TABLE "combinations" DROP COLUMN IF EXISTS "gradeId";

-- Create new unique constraint without gradeId
CREATE UNIQUE INDEX "combinations_tenantId_code_key" ON "combinations"("tenantId", "code");
