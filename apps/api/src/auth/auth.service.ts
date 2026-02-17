import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { signAccessToken } from './token.util';

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 300);
  private readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14);
  private readonly oneSessionPerUser = (process.env.ONE_SESSION_PER_USER ?? 'true') === 'true';

  constructor(private readonly prisma: PrismaService) {}

  hashPassword(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  generateRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  async login(email: string, password: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        passwordHash: true,
      },
    });

    if (!member || !member.active) {
      throw new UnauthorizedException('Geçersiz giriş bilgileri');
    }

    if (member.passwordHash !== this.hashPassword(password)) {
      throw new UnauthorizedException('Geçersiz giriş bilgileri');
    }

    const refreshToken = this.generateRefreshToken();
    if (this.oneSessionPerUser) {
      await this.prisma.authSession.updateMany({
        where: { memberId: member.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await this.prisma.authSession.create({
      data: {
        memberId: member.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000),
      },
    });
    const accessTokenExpiresAt = new Date(
      Date.now() + this.accessTtlSeconds * 1000,
    );

    return {
      accessToken: signAccessToken(
        { sub: member.id, role: member.role },
        this.accessTtlSeconds,
      ),
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken,
      user: {
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        active: member.active,
      },
    };
  }

  async refresh(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: {
        member: {
          select: { id: true, name: true, email: true, role: true, active: true },
        },
      },
    });
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() < Date.now() ||
      !session.member.active
    ) {
      throw new UnauthorizedException('Geçersiz yenileme anahtarı');
    }

    const nextRefresh = this.generateRefreshToken();
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashToken(nextRefresh),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    const accessTokenExpiresAt = new Date(
      Date.now() + this.accessTtlSeconds * 1000,
    );
    return {
      accessToken: signAccessToken(
        { sub: session.member.id, role: session.member.role },
        this.accessTtlSeconds,
      ),
      accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
      refreshToken: nextRefresh,
      user: session.member,
    };
  }

  async logout(refreshToken: string) {
    const hash = this.hashToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }

  async getActorOrThrow(userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });

    if (!member || !member.active) {
      throw new UnauthorizedException('Aktif kullanıcı bulunamadı');
    }
    return member;
  }
}
