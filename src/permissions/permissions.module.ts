import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { DeviceModule } from '../device/device.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [DeviceModule, ScheduleModule],
  controllers: [PermissionsController],
  providers: [PermissionsService],
  exports: [PermissionsService],
})
export class PermissionsModule {}
