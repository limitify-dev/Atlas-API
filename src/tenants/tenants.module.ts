import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
