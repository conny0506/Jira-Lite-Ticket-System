import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRateLimitService } from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import { CurrentUserId } from './current-user-id.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly authRateLimitService: AuthRateLimitService,
  ) {}

  private getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    const sameSiteEnv = (process.env.COOKIE_SAME_SITE ?? (isProd ? 'none' : 'lax'))
      .toLowerCase()
      .trim();
    const sameSite =
      sameSiteEnv === 'strict' || sameSiteEnv === 'lax' || sameSiteEnv === 'none'
        ? sameSiteEnv
        : isProd
          ? 'none'
          : 'lax';
    const secure =
      (process.env.COOKIE_SECURE ?? (isProd || sameSite === 'none' ? 'true' : 'false'))
        .toLowerCase()
        .trim() === 'true';
    const cookieDomain = process.env.COOKIE_DOMAIN?.trim();

    return {
      httpOnly: true,
      secure,
      sameSite: sameSite as 'strict' | 'lax' | 'none',
      domain: cookieDomain || undefined,
      path: '/auth',
      maxAge: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14) * 24 * 60 * 60 * 1000,
    };
  }

  private readRefreshToken(req: any, dto?: RefreshTokenDto) {
    if (dto?.refreshToken) return dto.refreshToken;
    const cookieHeader = (req.headers?.cookie as string | undefined) ?? '';
    const parts = cookieHeader.split(';').map((x) => x.trim());
    const tokenPart = parts.find((part) => part.startsWith('jid='));
    if (!tokenPart) return null;
    const value = tokenPart.slice(4);
    return decodeURIComponent(value);
  }

  private readClientIp(req: any) {
    const xff = (req.headers?.['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
    const xri = (req.headers?.['x-real-ip'] as string | undefined)?.trim();
    return xff || xri || req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private async enforceRateLimit(req: any, action: 'login' | 'refresh') {
    const ip = this.readClientIp(req);
    const isLogin = action === 'login';
    const limit = Number(
      process.env[isLogin ? 'AUTH_LOGIN_RATE_LIMIT_MAX' : 'AUTH_REFRESH_RATE_LIMIT_MAX'] ??
        (isLogin ? 10 : 60),
    );
    const windowSeconds = Number(
      process.env[
        isLogin
          ? 'AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS'
          : 'AUTH_REFRESH_RATE_LIMIT_WINDOW_SECONDS'
      ] ?? (isLogin ? 60 : 300),
    );
    const result = await this.authRateLimitService.increment(
      action,
      ip,
      limit,
      windowSeconds,
    );
    if (!result.allowed) {
      throw new HttpException(
        'Cok fazla istek gonderildi, lutfen tekrar deneyin',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  @Post('login')
  async login(@Req() req: any, @Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
    await this.enforceRateLimit(req, 'login');
    const result = await this.authService.login(dto.email, dto.password);
    res.cookie('jid', result.refreshToken, this.getCookieOptions());
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    };
  }

  @Get('me')
  me(@CurrentUserId() userId: string) {
    return this.authService.getActorOrThrow(userId);
  }

  @Post('refresh')
  async refresh(
    @Req() req: any,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: any,
  ) {
    await this.enforceRateLimit(req, 'refresh');
    const refreshToken = this.readRefreshToken(req, dto);
    if (!refreshToken) throw new UnauthorizedException('Yenileme anahtari zorunludur');
    const result = await this.authService.refresh(refreshToken);
    res.cookie('jid', result.refreshToken, this.getCookieOptions());
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    };
  }

  @Post('logout')
  async logout(
    @Req() req: any,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: any,
  ) {
    const refreshToken = this.readRefreshToken(req, dto);
    if (!refreshToken) throw new UnauthorizedException('Yenileme anahtari zorunludur');
    const result = await this.authService.logout(refreshToken);
    res.clearCookie('jid', { ...this.getCookieOptions(), maxAge: undefined });
    return result;
  }
}
