import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, Prisma } from "@prisma/client";
import { PaginatedResult } from "../common/interfaces/paginated-result.interface";
import { buildPaginatedResult } from "../common/pagination.util";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { AuditLogQueryDto } from "./dto/audit-log-query.dto";

@Injectable()
export class AuditLogsService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async findAll(query: AuditLogQueryDto): Promise<PaginatedResult<AuditLog>> {
    const { page, limit, sortBy, sortOrder, action, userId, dateFrom, dateTo } =
      query;

    const where: Prisma.AuditLogWhereInput = {
      ...(action && { action }),
      ...(userId && { userId }),
      ...((dateFrom || dateTo) && {
        createdAt: {
          ...(dateFrom && { gte: new Date(dateFrom) }),
          ...(dateTo && { lte: new Date(dateTo) }),
        },
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  }
}
