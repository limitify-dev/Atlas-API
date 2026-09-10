import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { StudentDayService } from './student-day.service';

/**
 * Keeps `student_attendance_days` fresh.
 *
 * Runs shortly after midnight and rebuilds a rolling window (yesterday +
 * today) for every tenant, so the Students dashboard, triage queue and
 * per-student analytics read the materialised table rather than re-joining
 * SchoolEntry + Attendance on every request. Admins can also trigger a
 * targeted rebuild via `POST /attendance/students/materialize`.
 */
@Injectable()
export class AttendanceMaterializationService {
  private readonly logger = new Logger(AttendanceMaterializationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentDays: StudentDayService,
  ) {}

  private key(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM, {
    name: 'student-attendance-day-materialize',
  })
  async nightly(): Promise<void> {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await this.rebuildWindow(this.key(yesterday), this.key(today));
  }

  /** Rebuild [from, to] for every active tenant. */
  async rebuildWindow(from: string, to: string): Promise<{ tenants: number }> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    let done = 0;
    for (const t of tenants) {
      try {
        const { pairs } = await this.studentDays.materializeRange(
          t.id,
          from,
          to,
        );
        done += 1;
        if (pairs > 0) {
          this.logger.log(
            `tenant ${t.id}: ${pairs} student-days rebuilt (${from}..${to})`,
          );
        }
      } catch (e) {
        this.logger.warn(
          `tenant ${t.id} materialize failed: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
    return { tenants: done };
  }
}
