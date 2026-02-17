import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Injectable()
export class TeamMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
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
        active: true,
      },
    });
  }

  async create(actorId: string, dto: CreateTeamMemberDto) {
    await this.assertCaptain(actorId);
    await this.validateRoleCapacity(dto.role ?? TeamRole.MEMBER);
    return this.prisma.teamMember.create({
      data: {
        name: dto.name.trim(),
        email: dto.email.toLowerCase().trim(),
        passwordHash: this.authService.hashPassword(dto.password),
        role: dto.role ?? TeamRole.MEMBER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  async update(actorId: string, id: string, dto: UpdateTeamMemberDto) {
    await this.assertCaptain(actorId);
    const member = await this.prisma.teamMember.findUnique({
      where: { id },
      select: { id: true, role: true },
    });
    if (!member) throw new NotFoundException('Takım üyesi bulunamadı');

    const nextRole = dto.role ?? member.role;
    const shouldCountForRole = dto.active !== false;
    if (shouldCountForRole) {
      await this.validateRoleCapacity(nextRole, id);
    }

    return this.prisma.teamMember.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        email: dto.email?.toLowerCase().trim(),
        role: dto.role,
        active: dto.active,
        passwordHash: dto.password
          ? this.authService.hashPassword(dto.password)
          : undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
      },
    });
  }

  async deactivate(actorId: string, id: string) {
    await this.assertCaptain(actorId);
    const member = await this.prisma.teamMember.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Takım üyesi bulunamadı');

    return this.prisma.teamMember.update({
      where: { id },
      data: { active: false },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
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
}
