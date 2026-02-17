import {
  BadRequestException,
  UnauthorizedException,
  createParamDecorator,
  ExecutionContext,
} from '@nestjs/common';
import { verifyAccessToken } from './token.util';

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new BadRequestException('Authorization başlığı zorunludur');
    }
    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new BadRequestException('Authorization değeri Bearer token olmalıdır');
    }
    try {
      const payload = verifyAccessToken(token);
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Erişim anahtarı geçersiz veya süresi dolmuş');
    }
  },
);
