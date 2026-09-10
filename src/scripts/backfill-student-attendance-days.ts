// Load .env before anything touches process.env (same as main.ts / worker.ts).
import 'dotenv/config';

import { PrismaClient } from '../../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { StudentDayService } from '../attendance/student-day.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One-off backfill of `student_attendance_days` from historical SchoolEntry +
 * Attendance rows.
 *
 *   npx ts-node src/scripts/backfill-student-attendance-days.ts [fromISO] [toISO]
 *
 * Defaults to the last 180 days. Safe to re-run — rows are upserted.
 * Needs DATABASE_URL — loaded from .env above, or pass it inline:
 *   DATABASE_URL=postgres://… npx ts-node src/scripts/backfill-student-attendance-days.ts
 */
async function main() {
  const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter: pool });

  const now = new Date();
  const from =
    process.argv[2] ??
    new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 10);
  const to = process.argv[3] ?? now.toISOString().slice(0, 10);

  const svc = new StudentDayService(prisma as unknown as PrismaService);

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true },
  });
  console.log(`Backfilling ${from}..${to} for ${tenants.length} tenant(s)`);

  let total = 0;
  for (const t of tenants) {
    const { pairs } = await svc.materializeRange(t.id, from, to);
    total += pairs;
    console.log(`  ${t.name}: ${pairs} student-days`);
  }

  console.log(`Done — ${total} student-day rows rebuilt.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
