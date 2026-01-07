import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getStats(tenantId: string) {
    const [totalStudents, totalSections, totalUsers] = await Promise.all([
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.section.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
    ]);

    // Calculate today's attendance percentage
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [presentCount, totalAttendanceCount] = await Promise.all([
      this.prisma.attendance.count({
        where: {
          tenantId,
          createdAt: { gte: today },
          status: 'PRESENT',
        },
      }),
      this.prisma.attendance.count({
        where: {
          tenantId,
          createdAt: { gte: today },
        },
      }),
    ]);

    const attendanceRate =
      totalAttendanceCount > 0
        ? (presentCount / totalAttendanceCount) * 100
        : 0;

    return {
      totalStudents,
      activeClasses: totalSections,
      attendanceRate: attendanceRate.toFixed(1) + '%',
      systemUsage: totalUsers > 0 ? 'Active' : 'N/A', // Placeholder for usage metric
      // We can add changes (+/- %) if we had historical data, but for now fixed
      studentChange: '+0%',
      classChange: '+0%',
      attendanceChange: '+0%',
      usageChange: '+0%',
    };
  }
}
