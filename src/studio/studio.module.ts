import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StudioController } from './studio.controller';
import { StudioTenantsService } from './services/studio-tenants.service';
import { StudioModulesService } from './services/studio-modules.service';
import { StudioSubscriptionService } from './services/studio-subscription.service';
import { AdminProvisionService } from './services/admin-provision.service';

@Module({
  imports: [PrismaModule],
  controllers: [StudioController],
  providers: [
    StudioTenantsService,
    StudioModulesService,
    StudioSubscriptionService,
    AdminProvisionService,
  ],
  exports: [StudioModulesService],
})
export class StudioModule {}
