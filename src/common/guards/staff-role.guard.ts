import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../../prisma/generated/client';
import { STAFF_ROLE_KEY } from '../decorators/staff-role.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guards routes that require a specific staff sub-role (e.g. "finance", "discipline").
 * Must be combined with JwtAuthGuard and used via @RequiresStaffRole(...).
 *
 * Example:
 *   @Post('invoices/:id/approve')
 *   @RequiresStaffRole('finance')
 *   approve() { ... }
 */
@Injectable()
export class StaffRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      STAFF_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No @RequiresStaffRole on this route — pass through
    if (!requiredRoles?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // SUPER_ADMIN and ADMIN bypass staff role checks
    if (user.role === Role.SUPER_ADMIN || user.role === Role.ADMIN) return true;

    if (user.role !== Role.STAFF) {
      throw new ForbiddenException('This action requires a staff account.');
    }

    const staff = await this.prisma.staff.findUnique({
      where: { userId: user.id },
      select: { staffRole: true },
    });

    if (!staff) {
      throw new ForbiddenException('Staff profile not found.');
    }

    if (!requiredRoles.includes(staff.staffRole)) {
      throw new ForbiddenException(
        `This action requires staff role: ${requiredRoles.join(' or ')}.`,
      );
    }

    return true;
  }
}
