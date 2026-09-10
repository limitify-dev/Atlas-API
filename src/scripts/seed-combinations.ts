// Load .env before anything touches process.env (same as main.ts / worker.ts).
import 'dotenv/config';

import { PrismaClient } from '../../prisma/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Seed the standard Rwandan A-level subject combinations as plain "label"
 * combinations (no subject list) so the Students filters and drawers have
 * something to show before the first bulk import.
 *
 *   npx ts-node -r tsconfig-paths/register src/scripts/seed-combinations.ts [tenantId]
 *
 * With no argument it seeds every tenant. Idempotent — combinations are matched
 * on the existing @@unique([tenantId, code]) and only created when missing.
 */

// code -> human label. Kept deliberately small; the importer's ensureCombination
// will add any others it meets in a real workbook.
const COMBINATIONS: Record<string, string> = {
  // Sciences
  MPC: 'Maths - Physics - Computer Science',
  MCB: 'Maths - Chemistry - Biology',
  MCE: 'Maths - Chemistry - Economics',
  MPG: 'Maths - Physics - Geography',
  PCB: 'Physics - Chemistry - Biology',
  PCM: 'Physics - Chemistry - Maths',
  BCG: 'Biology - Chemistry - Geography',
  // Humanities
  HEG: 'History - Economics - Geography',
  HGL: 'History - Geography - Literature',
  HLP: 'History - Literature - Psychology',
  LKK: 'Literature - Kinyarwanda - Kiswahili',
  LFK: 'Literature - French - Kinyarwanda',
  MEG: 'Maths - Economics - Geography',
  // Languages
  LEG: 'Literature - Economics - Geography',
  // School-specific stream labels seen in the enrolment sheet
  MS1: 'Maths & Sciences 1',
  MS2A: 'Maths & Sciences 2A',
  MS2B: 'Maths & Sciences 2B',
  ARTS: 'Arts',
};

async function main() {
  const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter: pool });

  const only = process.argv[2];
  const tenants = only
    ? await prisma.tenant.findMany({
        where: { id: only },
        select: { id: true, name: true },
      })
    : await prisma.tenant.findMany({ select: { id: true, name: true } });

  if (tenants.length === 0) {
    console.log(only ? `No tenant ${only}` : 'No tenants');
    return;
  }

  const codes = Object.entries(COMBINATIONS);
  console.log(
    `Seeding ${codes.length} combinations for ${tenants.length} tenant(s)`,
  );

  for (const t of tenants) {
    const existing = await prisma.combination.findMany({
      where: { tenantId: t.id },
      select: { code: true },
    });
    const have = new Set(existing.map((c) => c.code.toUpperCase()));
    const missing = codes.filter(([code]) => !have.has(code.toUpperCase()));

    if (missing.length > 0) {
      await prisma.combination.createMany({
        data: missing.map(([code, name]) => ({
          tenantId: t.id,
          code,
          name,
          subjectIds: [],
          isActive: true,
        })),
      });
    }
    console.log(
      `  ${t.name}: +${missing.length} created, ${have.size} already present`,
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
