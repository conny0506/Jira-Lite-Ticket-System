import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Department, Prisma, TeamRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PasswordResetMailService } from '../auth/password-reset-mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Injectable()
export class TeamMembersService {
  private readonly logger = new Logger(TeamMembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly mailService: PasswordResetMailService,
  ) {}

  async list(actorId: string, activeOnly?: boolean) {
    const actor = await this.authService.getActorOrThrow(actorId);
    return this.prisma.teamMember.findMany({
      where: {
        ...(activeOnly ? { active: true } : {}),
        ...(actor.role === TeamRole.CAPTAIN ? {} : { id: actor.id }),
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isIntern: true,
        active: true,
        departments: {
          select: { department: true },
          orderBy: { department: 'asc' },
        },
      },
    });
  }

  async create(actorId: string, dto: CreateTeamMemberDto) {
    await this.assertCaptain(actorId);
    const normalizedEmail = dto.email.toLowerCase().trim();
    const nextRole = dto.role ?? TeamRole.MEMBER;
    const existingMember = await this.prisma.teamMember.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, active: true },
    });

    if (existingMember?.active) {
      throw new BadRequestException('Bu e-posta zaten kullaniliyor');
    }

    await this.validateRoleCapacity(nextRole, existingMember?.id);
    const departments = this.normalizeDepartments(
      dto.primaryDepartment,
      dto.secondaryDepartment,
    );
    const passwordHash = await this.authService.hashPassword(dto.password);

    if (existingMember && !existingMember.active) {
      const restored = await this.prisma.teamMember.update({
        where: { id: existingMember.id },
        data: {
          name: dto.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: nextRole,
          isIntern: dto.isIntern ?? false,
          active: true,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          departments: {
            deleteMany: {},
            createMany: {
              data: departments.map((department) => ({ department })),
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isIntern: true,
          active: true,
          departments: {
            select: { department: true },
            orderBy: { department: 'asc' },
          },
        },
      });
      await this.notifyWelcome(restored.email, restored.name, restored.isIntern);
      return restored;
    }

    try {
      const created = await this.prisma.teamMember.create({
        data: {
          name: dto.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: nextRole,
          isIntern: dto.isIntern ?? false,
          departments: {
            createMany: {
              data: departments.map((department) => ({ department })),
            },
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isIntern: true,
          active: true,
          departments: {
            select: { department: true },
            orderBy: { department: 'asc' },
          },
        },
      });
      await this.notifyWelcome(created.email, created.name, created.isIntern);
      return created;
    } catch (error) {
      this.rethrowKnownPrismaError(error);
      throw error;
    }
  }

  async update(actorId: string, id: string, dto: UpdateTeamMemberDto) {
    await this.assertCaptain(actorId);
    const member = await this.prisma.teamMember.findUnique({
      where: { id },
      select: { id: true, role: true, isIntern: true, email: true, name: true },
    });
    if (!member) throw new NotFoundException('Takım üyesi bulunamadı');

    const nextRole = dto.role ?? member.role;
    const shouldCountForRole = dto.active !== false;
    if (shouldCountForRole) {
      await this.validateRoleCapacity(nextRole, id);
    }
    const passwordHash = dto.password
      ? await this.authService.hashPassword(dto.password)
      : undefined;
    const nextDepartments =
      dto.primaryDepartment || dto.secondaryDepartment
        ? this.normalizeDepartments(dto.primaryDepartment, dto.secondaryDepartment)
        : null;

    try {
      const updated = await this.prisma.teamMember.update({
        where: { id },
        data: {
          name: dto.name?.trim(),
          email: dto.email?.toLowerCase().trim(),
          role: dto.role,
          active: dto.active,
          isIntern: dto.isIntern,
          passwordHash,
          ...(nextDepartments
            ? {
                departments: {
                  deleteMany: {},
                  createMany: {
                    data: nextDepartments.map((department) => ({ department })),
                  },
                },
              }
            : {}),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isIntern: true,
          active: true,
          departments: {
            select: { department: true },
            orderBy: { department: 'asc' },
          },
        },
      });
      await this.notifyPromotion(member, updated);
      return updated;
    } catch (error) {
      this.rethrowKnownPrismaError(error);
      throw error;
    }
  }

  async deactivate(actorId: string, id: string) {
    await this.assertCaptain(actorId);
    if (actorId === id) {
      throw new BadRequestException('Kaptan kendi hesabini pasiflestiremez');
    }

    const member = await this.prisma.teamMember.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Takım üyesi bulunamadı');
    if (member.role === TeamRole.CAPTAIN) {
      throw new BadRequestException('Aktif kaptan pasiflestirilemez');
    }

    return this.prisma.teamMember.update({
      where: { id },
      data: { active: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isIntern: true,
        active: true,
        departments: {
          select: { department: true },
          orderBy: { department: 'asc' },
        },
      },
    });
  }

  private async assertCaptain(actorId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new BadRequestException('Takım üyelerini sadece kaptan yönetebilir');
    }
  }

  private async validateRoleCapacity(role: TeamRole, ignoreId?: string) {
    if (role === TeamRole.CAPTAIN) {
      const captainCount = await this.prisma.teamMember.count({
        where: {
          active: true,
          role: TeamRole.CAPTAIN,
          ...(ignoreId ? { id: { not: ignoreId } } : {}),
        },
      });
      if (captainCount >= 1) {
        throw new BadRequestException('Sistemde yalnızca bir aktif kaptan olabilir');
      }
    }

    if (role === TeamRole.BOARD) {
      const boardCount = await this.prisma.teamMember.count({
        where: {
          active: true,
          role: TeamRole.BOARD,
          ...(ignoreId ? { id: { not: ignoreId } } : {}),
        },
      });
      if (boardCount >= 3) {
        throw new BadRequestException(
          'Yönetim kurulu ekibi en fazla 3 aktif üyeden oluşabilir',
        );
      }
    }
  }

  private normalizeDepartments(primary?: Department, secondary?: Department) {
    if (!primary) {
      throw new BadRequestException('Birincil departman zorunludur');
    }
    const values = [primary, secondary].filter(Boolean) as Department[];
    const unique = [...new Set(values)];
    if (unique.length === 0) {
      throw new BadRequestException('En az bir departman secilmelidir');
    }
    if (unique.length > 2) {
      throw new BadRequestException('En fazla iki departman secilebilir');
    }
    return unique;
  }

  private rethrowKnownPrismaError(error: unknown): never | void {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return;
    if (error.code === 'P2002') {
      throw new BadRequestException('Bu e-posta zaten kullaniliyor');
    }
  }

  private async notifyWelcome(email: string, name: string, isIntern: boolean) {
    try {
      await this.mailService.sendWelcomeEmail({
        to: email,
        name,
        kind: isIntern ? 'intern' : 'member',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Welcome mail failed for ${email}: ${message}`);
    }
  }

  private async notifyPromotion(
    before: { role: TeamRole; isIntern: boolean; email: string; name: string },
    after: { role: TeamRole; isIntern: boolean; email: string; name: string },
  ) {
    let kind: 'intern_to_member' | 'member_to_board' | null = null;
    if (before.isIntern && !after.isIntern && after.role === TeamRole.MEMBER) {
      kind = 'intern_to_member';
    } else if (
      !before.isIntern &&
      before.role === TeamRole.MEMBER &&
      after.role === TeamRole.BOARD
    ) {
      kind = 'member_to_board';
    }

    if (!kind) return;
    try {
      await this.mailService.sendPromotionEmail({
        to: after.email,
        name: after.name,
        kind,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown';
      this.logger.error(`Promotion mail failed for ${after.email}: ${message}`);
    }
  }
}

