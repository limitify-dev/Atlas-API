import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';
import { SupabaseService } from 'src/common/supabase/supabase.service';

@Module({
  imports: [PrismaModule],
  controllers: [TeachersController],
  providers: [TeachersService,SupabaseService],
  exports: [TeachersService],
})
export class TeachersModule {}
