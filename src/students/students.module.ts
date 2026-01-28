import { Module } from '@nestjs/common';
import { StudentsController } from './students.controller';
import { StudentsService } from './students.service';
import { SupabaseService } from 'src/common/supabase/supabase.service';

@Module({
  controllers: [StudentsController],
  providers: [StudentsService, SupabaseService],
  exports: [StudentsService],
})
export class StudentsModule {}
