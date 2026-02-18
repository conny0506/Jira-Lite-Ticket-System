import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordResetMailService } from './password-reset-mail.service';
import { signAccessToken } from './token.util';

@Injectable()
export class AuthService {
  private readonly accessTtlSeconds = Number(process.env.ACCESS_TOKEN_TTL_SECONDS ?? 300);
  private readonly refreshTtlDays = Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 14);
  private readonly passwordResetTtlMinutes = Number(
    process.env.PASSWORD_RESET_TTL_MINUTES ?? 30,
  );
  private readonly oneSessionPerUser = (process.env.ONE_SESSION_PER_USER ?? 'true') === 'true';

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordResetMailService: PasswordResetMailService,
  ) {}

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

  private generatePasswordResetToken() {
    return randomBytes(48).toString('base64url');
  }

  async login(email: string, password: string, meta?: { ip?: string; userAgent?: string }) {
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
    await this.prisma.$transaction([
      this.prisma.teamMember.update({
        where: { id: member.id },
        data: {
          lastLoginAt: new Date(),
          lastLoginIp: meta?.ip?.slice(0, 120) || null,
        },
      }),
      this.prisma.loginAudit.create({
        data: {
          memberId: member.id,
          ip: meta?.ip?.slice(0, 120) || null,
          userAgent: meta?.userAgent?.slice(0, 300) || null,
        },
      }),
    ]);
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

  async forgotPassword(email: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const member = await this.prisma.teamMember.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, name: true, email: true, active: true },
    });

    if (!member || !member.active) {
      return { ok: true };
    }

    const rawToken = this.generatePasswordResetToken();
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.passwordResetTtlMinutes * 60 * 1000);

    await this.prisma.$executeRaw`
      UPDATE "TeamMember"
      SET "passwordResetTokenHash" = ${tokenHash},
          "passwordResetExpiresAt" = ${expiresAt},
          "updatedAt" = NOW()
      WHERE "id" = ${member.id}
    `;

    const baseUrl =
      process.env.PASSWORD_RESET_URL_BASE?.trim() ||
      `${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',')[0].trim()}/reset-password`;
    const resetUrl = `${baseUrl}?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.passwordResetMailService.sendPasswordResetEmail({
        to: member.email,
        name: member.name,
        resetUrl,
      });
    } catch (error) {
      const detail = (error as Error).message ? ` (${(error as Error).message})` : '';
      throw new ServiceUnavailableException(
        `Sifre sifirlama e-postasi gonderilemedi. SMTP ayarlarini kontrol edin${detail}`,
      );
    }

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token.trim());
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "TeamMember"
      WHERE "passwordResetTokenHash" = ${tokenHash}
        AND "passwordResetExpiresAt" > NOW()
        AND "active" = true
      LIMIT 1
    `;
    const member = rows[0] ?? null;

    if (!member) {
      throw new BadRequestException('Sifre sifirlama baglantisi gecersiz veya suresi dolmus');
    }

    await this.prisma.$transaction([
      this.prisma.teamMember.update({
        where: { id: member.id },
        data: {
          passwordHash: await this.hashPassword(newPassword),
        },
      }),
      this.prisma.$executeRaw`
        UPDATE "TeamMember"
        SET "passwordResetTokenHash" = NULL,
            "passwordResetExpiresAt" = NULL,
            "updatedAt" = NOW()
        WHERE "id" = ${member.id}
      `,
      this.prisma.authSession.updateMany({
        where: { memberId: member.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

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

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: userId },
      select: {
        id: true,
        active: true,
        passwordHash: true,
      },
    });
    if (!member || !member.active) {
      throw new UnauthorizedException('Aktif kullanici bulunamadi');
    }
    const isValid = await this.verifyPassword(member.passwordHash, currentPassword);
    if (!isValid) {
      throw new UnauthorizedException('Mevcut sifre hatali');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException('Yeni sifre mevcut sifre ile ayni olamaz');
    }

    await this.prisma.$transaction([
      this.prisma.teamMember.update({
        where: { id: member.id },
        data: {
          passwordHash: await this.hashPassword(newPassword),
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      }),
      this.prisma.authSession.updateMany({
        where: { memberId: member.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return { ok: true };
  }

  async getProfile(userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        language: true,
        notificationEmailEnabled: true,
        notificationAssignmentEnabled: true,
        notificationReviewEnabled: true,
        lastLoginAt: true,
        lastLoginIp: true,
      },
    });
    if (!member || !member.active) {
      throw new UnauthorizedException('Aktif kullanici bulunamadi');
    }
    return member;
  }

  async updateProfile(userId: string, name: string) {
    return this.prisma.teamMember.update({
      where: { id: userId },
      data: { name: name.trim() },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  async updateSettings(
    userId: string,
    payload: {
      language?: 'tr' | 'en';
      notificationEmailEnabled?: boolean;
      notificationAssignmentEnabled?: boolean;
      notificationReviewEnabled?: boolean;
    },
  ) {
    return this.prisma.teamMember.update({
      where: { id: userId },
      data: {
        ...(payload.language ? { language: payload.language } : {}),
        ...(typeof payload.notificationEmailEnabled === 'boolean'
          ? { notificationEmailEnabled: payload.notificationEmailEnabled }
          : {}),
        ...(typeof payload.notificationAssignmentEnabled === 'boolean'
          ? { notificationAssignmentEnabled: payload.notificationAssignmentEnabled }
          : {}),
        ...(typeof payload.notificationReviewEnabled === 'boolean'
          ? { notificationReviewEnabled: payload.notificationReviewEnabled }
          : {}),
      },
      select: {
        language: true,
        notificationEmailEnabled: true,
        notificationAssignmentEnabled: true,
        notificationReviewEnabled: true,
      },
    });
  }

  async getLoginHistory(userId: string) {
    return this.prisma.loginAudit.findMany({
      where: { memberId: userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
      },
    });
  }
}
