import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AuditAction, Client, Prisma } from "@prisma/client";
import { PaginatedResult } from "../common/interfaces/paginated-result.interface";
import { buildPaginatedResult } from "../common/pagination.util";
import {
  TENANT_SCOPED_PRISMA,
  TenantScopedPrismaClient,
} from "../prisma/tenant-scoped-prisma.provider";
import { ClientQueryDto } from "./dto/client-query.dto";
import { CreateClientDto } from "./dto/create-client.dto";
import { UpdateClientDto } from "./dto/update-client.dto";

@Injectable()
export class ClientsService {
  constructor(
    @Inject(TENANT_SCOPED_PRISMA)
    private readonly prisma: TenantScopedPrismaClient,
  ) {}

  async create(dto: CreateClientDto): Promise<Client> {
    try {
      return await this.prisma.client.create({
        data: dto as unknown as Prisma.ClientUncheckedCreateInput,
      });
    } catch (error) {
      this.rethrowUniqueConstraintError(error);
    }
  }

  async findAll(query: ClientQueryDto): Promise<PaginatedResult<Client>> {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      name,
      email,
      document,
      city,
      state,
    } = query;

    const where: Prisma.ClientWhereInput = {
      deletedAt: null,
      ...(name && { name: { contains: name } }),
      ...(email && { email: { contains: email } }),
      ...(document && { document: { contains: document } }),
      ...(city && { city: { contains: city } }),
      ...(state && { state }),
    };

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return buildPaginatedResult(data, page, limit, total);
  }

  async findOne(id: string): Promise<Client> {
    const client = await this.prisma.client.findFirst({
      where: { id, deletedAt: null },
    });

    if (!client) {
      throw new NotFoundException("Cliente não encontrado");
    }

    return client;
  }

  async update(id: string, dto: UpdateClientDto): Promise<Client> {
    await this.findOne(id);

    try {
      return await this.prisma.client.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUniqueConstraintError(error);
    }
  }

  async remove(id: string, userId: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: AuditAction.CLIENT_DELETED,
        metadata: { clientId: id },
      },
    });
  }

  private rethrowUniqueConstraintError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("Já existe um cliente com este documento");
    }
    throw error;
  }
}
