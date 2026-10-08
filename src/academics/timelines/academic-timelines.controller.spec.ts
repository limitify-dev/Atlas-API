import 'reflect-metadata';
import { AcademicWindowType } from '../../../prisma/generated/client';
import { AuthUser } from '../../auth/decorators/current-user.decorator';
import { REQUIRED_MODULE_KEY } from '../../common/module-access/require-module.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { AcademicTimelinesController } from './academic-timelines.controller';
import { AcademicTimelinesService } from './academic-timelines.service';

describe('AcademicTimelinesController terms access', () => {
  it('bypasses the controller module gate for every dedicated term action', () => {
    expect(
      Reflect.getMetadata(REQUIRED_MODULE_KEY, AcademicTimelinesController),
    ).toBe('academics');

    const termHandlers = [
      'createTerm',
      'getTerms',
      'getTerm',
      'updateTerm',
      'activateTerm',
      'closeTerm',
      'cancelTerm',
      'removeTerm',
    ];

    for (const name of termHandlers) {
      const handler = Object.getOwnPropertyDescriptor(
        AcademicTimelinesController.prototype,
        name,
      )?.value as object;
      expect(Reflect.getMetadata(REQUIRED_MODULE_KEY, handler)).toBeNull();
    }
  });

  it('routes term listing through the term-only service method', async () => {
    const findTerms = jest.fn().mockResolvedValue([]);
    const controller = new AcademicTimelinesController({
      findTerms,
    } as unknown as AcademicTimelinesService);

    await controller.getTerms({ tenantId: 'tenant-1' } as AuthUser, {
      academicYear: '2026-2027',
    });

    expect(findTerms).toHaveBeenCalledWith('tenant-1', {
      academicYear: '2026-2027',
    });
  });
});

describe('AcademicTimelinesService term isolation', () => {
  it('forces list queries to TERM even when another type is requested', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new AcademicTimelinesService({
      academicTimeline: { findMany },
    } as unknown as PrismaService);

    await service.findTerms('tenant-1', { type: AcademicWindowType.EXAM });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: AcademicWindowType.TERM }),
      }),
    );
  });

  it('refuses to mutate a non-term through a dedicated term action', async () => {
    const remove = jest.fn();
    const service = new AcademicTimelinesService({
      academicTimeline: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'exam-1',
          tenantId: 'tenant-1',
          type: AcademicWindowType.EXAM,
        }),
        delete: remove,
      },
    } as unknown as PrismaService);

    await expect(service.removeTerm('tenant-1', 'exam-1')).rejects.toThrow(
      'Academic term not found.',
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
