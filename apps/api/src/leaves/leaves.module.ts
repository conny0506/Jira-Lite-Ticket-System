import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LeavesController } from './leaves.controller';
import { LeavesService } from './leaves.service';

@Module({
  imports: [AuthModule],
  controllers: [LeavesController],
  providers: [LeavesService],
})
export class LeavesModule {}
