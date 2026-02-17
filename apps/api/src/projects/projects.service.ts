import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TeamRole } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectAssigneesDto } from './dto/update-project-assignees.dto';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async create(actorId: string, dto: CreateProjectDto) {
    await this.assertCaptain(actorId);
    await this.ensureMembersActive(dto.assigneeIds ?? []);

    return this.prisma.project.create({
      data: {
        name: dto.name,
        key: dto.key.toUpperCase(),
        description: dto.description,
        assignments:
          dto.assigneeIds && dto.assigneeIds.length > 0
            ? {
                createMany: {
                  data: [...new Set(dto.assigneeIds)].map((memberId) => ({
                    memberId,
                  })),
                },
              }
            : undefined,
      },
      include: {
        assignments: {
          include: {
            member: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
  }

  async list(actorId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    return this.prisma.project.findMany({
      where:
        actor.role === TeamRole.CAPTAIN
          ? undefined
          : {
              assignments: {
                some: { memberId: actor.id },
              },
            },
      orderBy: { createdAt: 'desc' },
      include: {
        assignments: {
          include: {
            member: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
  }

  async updateAssignees(
    actorId: string,
    id: string,
    dto: UpdateProjectAssigneesDto,
  ) {
    await this.assertCaptain(actorId);
    await this.ensureProjectExists(id);
    await this.ensureMembersActive(dto.assigneeIds);
    const uniqueIds = [...new Set(dto.assigneeIds)];

    await this.prisma.$transaction([
      this.prisma.projectAssignment.deleteMany({ where: { projectId: id } }),
      this.prisma.projectAssignment.createMany({
        data: uniqueIds.map((memberId) => ({ projectId: id, memberId })),
      }),
    ]);

    return this.prisma.project.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            member: { select: { id: true, name: true, email: true, role: true } },
          },
        },
      },
    });
  }

  async remove(actorId: string, id: string) {
    await this.assertCaptain(actorId);
    await this.ensureProjectExists(id);
    return this.prisma.project.delete({ where: { id } });
  }

  private async ensureMembersActive(memberIds: string[]) {
    if (memberIds.length === 0) return;
    const count = await this.prisma.teamMember.count({
      where: {
        id: { in: [...new Set(memberIds)] },
        active: true,
      },
    });
    if (count !== [...new Set(memberIds)].length) {
      throw new BadRequestException('All assignees must be active team members');
    }
  }

  private async ensureProjectExists(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  private async assertCaptain(actorId: string) {
    const actor = await this.authService.getActorOrThrow(actorId);
    if (actor.role !== TeamRole.CAPTAIN) {
      throw new BadRequestException('Only captain can manage projects');
    }
  }
}
