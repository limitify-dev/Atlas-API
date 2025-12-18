import { Module } from '@nestjs/common';
import { BusesModule } from './buses/buses.module';
import { BusRoutesModule } from './routes/routes.module';
import { TransportAssignmentsModule } from './assignments/assignments.module';

@Module({
  imports: [BusesModule, BusRoutesModule, TransportAssignmentsModule],
  exports: [BusesModule, BusRoutesModule, TransportAssignmentsModule],
})
export class TransportModule {}
