import { Body, Controller, Get, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { CurrentUserId } from './current-user-id.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  private getCookieOptions() {
    const isProd = process.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: (isProd ? 'strict' : 'lax') as 'strict' | 'lax',
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

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: any) {
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
    const refreshToken = this.readRefreshToken(req, dto);
    if (!refreshToken) throw new UnauthorizedException('Yenileme anahtarı zorunludur');
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
    if (!refreshToken) throw new UnauthorizedException('Yenileme anahtarı zorunludur');
    const result = await this.authService.logout(refreshToken);
    res.clearCookie('jid', { ...this.getCookieOptions(), maxAge: undefined });
    return result;
  }
}
