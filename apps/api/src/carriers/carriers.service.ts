import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, Carrier, Prisma } from "@prisma/client";
import { PaginatedResult } from "../common/interfaces/paginated-result.interface";
import { buildPaginatedResult } from "../common/pagination.util";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { CarrierQueryDto } from "./dto/carrier-query.dto";
import { CreateCarrierDto } from "./dto/create-carrier.dto";
import { UpdateCarrierDto } from "./dto/update-carrier.dto";

@Injectable()
export class CarriersService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async create(dto: CreateCarrierDto): Promise<Carrier> {
    try {
      return await this.prisma.carrier.create({
        data: dto as unknown as Prisma.CarrierUncheckedCreateInput,
      });
    } catch (error) {
      this.rethrowUniqueConstraintError(error);
    }
  }

  async findAll(query: CarrierQueryDto): Promise<PaginatedResult<Carrier>> {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      name,
      document,
      city,
      state,
      active,
    } = query;

    const where: Prisma.CarrierWhereInput = {
      deletedAt: null,
      ...(name && { name: { contains: name } }),
      ...(document && { document: { contains: document } }),
      ...(city && { city: { contains: city } }),
      ...(state && { state }),
      ...(active !== undefined && { active }),
    };

    const [data, total] = await Promise.all([
      this.prisma.carrier.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.carrier.count({ where }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  }

  async findOne(id: string): Promise<Carrier> {
    const carrier = await this.prisma.carrier.findFirst({
      where: { id, deletedAt: null },
    });

    if (!carrier) {
      throw new NotFoundException("Transportadora não encontrada");
    }

    return carrier;
  }

  async update(id: string, dto: UpdateCarrierDto): Promise<Carrier> {
    await this.findOne(id);

    try {
      return await this.prisma.carrier.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUniqueConstraintError(error);
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.carrier.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.CARRIER_DELETED,
        metadata: { carrierId: id },
      },
    });
  }

  private rethrowUniqueConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "Já existe uma transportadora com este documento",
      );
    }
    throw error;
  }
}
