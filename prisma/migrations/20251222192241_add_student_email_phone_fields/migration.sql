-- AlterTable
ALTER TABLE "students" ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;
