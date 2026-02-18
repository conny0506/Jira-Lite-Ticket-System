import { Module } from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetMailService } from './password-reset-mail.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService, PasswordResetMailService],
  exports: [AuthService, PasswordResetMailService],
})
export class AuthModule {}
