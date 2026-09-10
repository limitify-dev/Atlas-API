-- Students-list bulk import: date of birth is now optional, and a student
-- carries a boarding / day-scholar "program".

-- CreateEnum
CREATE TYPE "SchoolProgram" AS ENUM ('BOARDING', 'DAY');

-- AlterTable
ALTER TABLE "students" ALTER COLUMN "dateOfBirth" DROP NOT NULL;
ALTER TABLE "students" ADD COLUMN "program" "SchoolProgram";
