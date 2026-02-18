import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { signAccessToken } from './token.util';

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 300);
  private readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14);
  private readonly oneSessionPerUser = (process.env.ONE_SESSION_PER_USER ?? 'true') === 'true';

  constructor(private readonly prisma: PrismaService) {}

  async hashPassword(password: string) {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private hashPasswordLegacy(password: string) {
    return createHash('sha256').update(password).digest('hex');
  }

  private isArgon2Hash(hash: string) {
    return hash.startsWith('$argon2');
  }

  private async verifyPassword(storedHash: string, password: string) {
    if (this.isArgon2Hash(storedHash)) {
      return argon2.verify(storedHash, password);
    }
    return storedHash === this.hashPasswordLegacy(password);
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
      throw new UnauthorizedException('Gecersiz giris bilgileri');
    }

    const isValidPassword = await this.verifyPassword(member.passwordHash, password);
    if (!isValidPassword) {
      throw new UnauthorizedException('Gecersiz giris bilgileri');
    }
    if (!this.isArgon2Hash(member.passwordHash)) {
      await this.prisma.teamMember.update({
        where: { id: member.id },
        data: { passwordHash: await this.hashPassword(password) },
      });
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
    const accessTokenExpiresAt = new Date(Date.now() + this.accessTtlSeconds * 1000);

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
      throw new UnauthorizedException('Gecersiz yenileme anahtari');
    }

    const nextRefresh = this.generateRefreshToken();
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashToken(nextRefresh),
        expiresAt: new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000),
      },
    });

    const accessTokenExpiresAt = new Date(Date.now() + this.accessTtlSeconds * 1000);
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
      throw new UnauthorizedException('Aktif kullanici bulunamadi');
    }
    return member;
  }
}
