import { Controller, Get, UseGuards } from '@nestjs/common';
import { ParentsService } from './parents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../prisma/generated/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('parents')
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Get('my-children')
  @Roles(Role.PARENT)
  async getMyChildren(@CurrentUser() user: any) {
    return this.parentsService.getMyChildren(user.id, user.tenantId);
  }

  @Get('my-financials')
  @Roles(Role.PARENT)
  async getMyFinancials(@CurrentUser() user: any) {
    return this.parentsService.getMyFinancials(user.id, user.tenantId);
  }
}
