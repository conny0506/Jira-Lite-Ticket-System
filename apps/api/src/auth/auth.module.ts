import { Module } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService],
  exports: [AuthService],
})
export class AuthModule {}
