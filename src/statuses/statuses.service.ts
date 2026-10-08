import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AUTH_MESSAGES } from '../common/constants/auth-messages';
import { CreateStatusDto } from './dto/create-status.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { ReorderStatusDto } from './dto/reorder-status.dto';

const TASK_CONFLICT =
  'Status still has tasks, move them to another status first';

@Injectable()
export class StatusesService {
  constructor(private readonly prisma: PrismaService) {}

  // Seluruh pengecekan dan perubahan diulang jika transaksi berkonflik.
  private async mutate<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034'
        ) {
          if (attempt < 2) continue;

          throw new ConflictException(
            'Statuses changed concurrently, please retry',
          );
        }

        throw error;
      }
    }
  }

  private async verifyProjectMember(
    db: Prisma.TransactionClient,
    projectId: string,
    userId: string,
    admin = false,
  ) {
    const member = await db.t_project_member.findFirst({
      where: {
        project_id: projectId,
        user_id: userId,
      },
    });

    if (!member) {
      throw new ForbiddenException(AUTH_MESSAGES.NOT_MEMBER);
    }

    if (admin && member.role !== 'admin') {
      throw new ForbiddenException(AUTH_MESSAGES.NOT_ADMIN);
    }
  }

  private async getStatus(
    db: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) {
    const status = await db.r_status.findUnique({
      where: { id },
    });

    if (!status) {
      throw new NotFoundException('Status not found');
    }

    await this.verifyProjectMember(
      db,
      status.project_id,
      userId,
      true,
    );

    return status;
  }

  async create(
    projectId: string,
    userId: string,
    dto: CreateStatusDto,
  ) {
    return this.mutate(async (tx) => {
      await this.verifyProjectMember(tx, projectId, userId, true);

      const last = await tx.r_status.findFirst({
        where: { project_id: projectId },
        orderBy: { order: 'desc' },
      });

      return tx.r_status.create({
        data: {
          project_id: projectId,
          name: dto.name,
          order: (last?.order ?? 0) + 1,
          is_default: !last,
        },
      });
    });
  }

  async findAllByProject(projectId: string, userId: string) {
    await this.verifyProjectMember(this.prisma, projectId, userId);

    return this.prisma.r_status.findMany({
      where: { project_id: projectId },
      orderBy: { order: 'asc' },
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateStatusDto,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw new BadRequestException(
        'At least one field must be provided',
      );
    }

    return this.mutate(async (tx) => {
      const status = await this.getStatus(tx, id, userId);

      if (dto.is_default === false && status.is_default) {
        throw new BadRequestException(
          'Set another status as default first',
        );
      }

      if (dto.is_default === true) {
        await tx.r_status.updateMany({
          where: {
            project_id: status.project_id,
            is_default: true,
            NOT: { id },
          },
          data: { is_default: false },
        });
      }

      return tx.r_status.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.order !== undefined && { order: dto.order }),
          ...(dto.is_default !== undefined && {
            is_default: dto.is_default,
          }),
          ...(dto.is_done !== undefined && {
            is_done: dto.is_done,
          }),
        },
      });
    });
  }

  async remove(id: string, userId: string) {
    try {
      return await this.mutate(async (tx) => {
        const status = await this.getStatus(tx, id, userId);

        const linkedTaskCount = await tx.t_task.count({
          where: { status_id: id },
        });

        if (linkedTaskCount > 0) {
          throw new ConflictException(TASK_CONFLICT);
        }

        const totalStatuses = await tx.r_status.count({
          where: { project_id: status.project_id },
        });

        if (totalStatuses <= 1) {
          throw new BadRequestException(
            'Project must have at least one status',
          );
        }

        await tx.r_status.delete({
          where: { id },
        });

        if (status.is_default) {
          const nextStatus = await tx.r_status.findFirst({
            where: { project_id: status.project_id },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
          });

          if (!nextStatus) {
            throw new BadRequestException(
              'Project must have at least one status',
            );
          }

          await tx.r_status.update({
            where: { id: nextStatus.id },
            data: { is_default: true },
          });
        }

        return null;
      });
    } catch (error) {
      // Menangani task yang memakai status setelah pengecekan count.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(TASK_CONFLICT);
      }

      throw error;
    }
  }

  async reorder(
    projectId: string,
    userId: string,
    dto: ReorderStatusDto,
  ) {
    return this.mutate(async (tx) => {
      await this.verifyProjectMember(tx, projectId, userId, true);

      const statuses = await tx.r_status.findMany({
        where: { project_id: projectId },
      });

      const ids = new Set(dto.order);

      if (
        !ids.size ||
        ids.size !== dto.order.length ||
        statuses.length !== ids.size ||
        statuses.some((status) => !ids.has(status.id))
      ) {
        throw new BadRequestException(
          'order must contain every project status exactly once',
        );
      }

      for (const [index, id] of dto.order.entries()) {
        await tx.r_status.update({
          where: { id },
          data: { order: index + 1 },
        });
      }

      return tx.r_status.findMany({
        where: { project_id: projectId },
        orderBy: { order: 'asc' },
      });
    });
  }
}