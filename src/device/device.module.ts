import { Module } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DeviceController } from './device.controller';
import { DeviceApiController } from './device-api.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceController, DeviceApiController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class DeviceModule {}
