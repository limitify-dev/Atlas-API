import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService attendance totals', () => {
  it('uses all enrolled students as the attendance denominator', async () => {
    const prisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
      },
      student: { count: jest.fn().mockResolvedValue(870) },
      section: { count: jest.fn().mockResolvedValue(1) },
      user: { count: jest.fn().mockResolvedValue(1) },
      teacher: { count: jest.fn().mockResolvedValue(1) },
      attendance: {
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      permission: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      conductRecord: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new DashboardService(prisma as unknown as PrismaService);

    const stats = await service.getStats('tenant-1');

    expect(stats.todayPresent).toBe(1);
    expect(stats.todayTotal).toBe(870);
    expect(stats.attendanceRate).toBe('0.1%');
  });
});
