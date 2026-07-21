import { InjectQueue } from "@nestjs/bullmq";
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, FreightQuote, Prisma } from "@prisma/client";
import { Queue } from "bullmq";
import { PaginatedResult } from "../common/interfaces/paginated-result.interface";
import { buildPaginatedResult } from "../common/pagination.util";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { getTenantContext } from "../tenant/tenant-context";
import { CreateFreightQuoteDto } from "./dto/create-freight-quote.dto";
import { FreightQuoteQueryDto } from "./dto/freight-quote-query.dto";
import { UpdateFreightQuoteDto } from "./dto/update-freight-quote.dto";
import {
  FREIGHT_QUOTE_CALCULATION_JOB,
  FREIGHT_QUOTE_QUEUE,
  FreightQuoteJobData,
} from "./freight-quote-queue.constants";

const QUOTE_WITH_OPTIONS_INCLUDE = {
  options: {
    include: { carrier: { select: { id: true, name: true } } },
  },
} satisfies Prisma.FreightQuoteInclude;

export type FreightQuoteWithOptions = Prisma.FreightQuoteGetPayload<{
  include: typeof QUOTE_WITH_OPTIONS_INCLUDE;
}>;

@Injectable()
export class FreightQuotesService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
    @InjectQueue(FREIGHT_QUOTE_QUEUE)
    private readonly freightQuoteQueue: Queue<FreightQuoteJobData>,
  ) {}

  async create(
    dto: CreateFreightQuoteDto,
    userId: string,
  ): Promise<FreightQuoteWithOptions> {
    const quote = await this.prisma.freightQuote.create({
      data: {
        ...dto,
        userId,
      } as unknown as Prisma.FreightQuoteUncheckedCreateInput,
    });

    const tenantContext = getTenantContext();
    if (!tenantContext) {
      throw new InternalServerErrorException(
        "Contexto de tenant ausente ao enfileirar cálculo de frete",
      );
    }

    await this.freightQuoteQueue.add(
      FREIGHT_QUOTE_CALCULATION_JOB,
      {
        quoteId: quote.id,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        role: tenantContext.role,
      },
      { attempts: 1 },
    );

    return this.findOne(quote.id);
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

  async findOne(id: string): Promise<FreightQuoteWithOptions> {
    const quote = await this.prisma.freightQuote.findFirst({
      where: { id, deletedAt: null },
      include: QUOTE_WITH_OPTIONS_INCLUDE,
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
