import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { jwtConstants } from '../auth/constant';

@Module({
  imports: [
    JwtModule.register({
      secret: jwtConstants.secret,
      // No expiry for student card tokens - they are permanent
    }),
  ],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
