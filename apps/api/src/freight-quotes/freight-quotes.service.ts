import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, FreightQuote, Prisma } from "@prisma/client";
import { PaginatedResult } from "../common/interfaces/paginated-result.interface";
import { buildPaginatedResult } from "../common/pagination.util";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { CreateFreightQuoteDto } from "./dto/create-freight-quote.dto";
import { FreightQuoteQueryDto } from "./dto/freight-quote-query.dto";
import { UpdateFreightQuoteDto } from "./dto/update-freight-quote.dto";

@Injectable()
export class FreightQuotesService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async create(
    dto: CreateFreightQuoteDto,
    userId: string,
  ): Promise<FreightQuote> {
    return this.prisma.freightQuote.create({
      data: {
        ...dto,
        userId,
      } as unknown as Prisma.FreightQuoteUncheckedCreateInput,
    });
  }

  async findAll(
    query: FreightQuoteQueryDto,
  ): Promise<PaginatedResult<FreightQuote>> {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      status,
      originZipCode,
      destinationZipCode,
    } = query;

    const where: Prisma.FreightQuoteWhereInput = {
      deletedAt: null,
      ...(status && { status }),
      ...(originZipCode && { originZipCode }),
      ...(destinationZipCode && { destinationZipCode }),
    };

    const [data, total] = await Promise.all([
      this.prisma.freightQuote.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.freightQuote.count({ where }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  }

  async findOne(id: string): Promise<FreightQuote> {
    const quote = await this.prisma.freightQuote.findFirst({
      where: { id, deletedAt: null },
    });

    if (!quote) {
      throw new NotFoundException("Cotação de frete não encontrada");
    }

    return quote;
  }

  async update(id: string, dto: UpdateFreightQuoteDto): Promise<FreightQuote> {
    await this.findOne(id);

    return this.prisma.freightQuote.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.freightQuote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.FREIGHT_QUOTE_DELETED,
        metadata: { freightQuoteId: id },
      },
    });
  }
}
