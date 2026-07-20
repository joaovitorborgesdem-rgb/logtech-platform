import { Provider } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { getTenantContext } from "../tenant/tenant-context";
import { PrismaService } from "./prisma.service";

export const TENANT_SCOPED_PRISMA = Symbol("TENANT_SCOPED_PRISMA");

export interface QueryArgs {
  where?: Record<string, unknown>;
  data?: unknown;
}

const TENANT_SCOPED_MODELS = new Set<Prisma.ModelName>([
  "User",
  "Carrier",
  "Client",
  "FreightQuote",
  "AuditLog",
]);

const FILTERED_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

export function applyTenantScope(
  model: string | undefined,
  operation: string,
  args: QueryArgs,
  tenantId: string,
): QueryArgs {
  if (!model || !TENANT_SCOPED_MODELS.has(model as Prisma.ModelName)) {
    return args;
  }

  if (operation === "create") {
    return { ...args, data: { ...(args.data as object), tenantId } };
  }

  if (operation === "createMany" && Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((item: object) => ({ ...item, tenantId })),
    };
  }

  if (FILTERED_OPERATIONS.has(operation)) {
    return { ...args, where: { ...args.where, tenantId } };
  }

  return args;
}

export function createTenantScopedClient(prisma: PrismaService) {
  return prisma.$extends({
    name: "tenant-scoping",
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          const tenantContext = getTenantContext();
          if (!tenantContext) {
            return query(args);
          }

          return query(
            applyTenantScope(model, operation, args, tenantContext.tenantId),
          );
        },
      },
    },
  });
}

export type TenantScopedPrismaClient = ReturnType<
  typeof createTenantScopedClient
>;

export const tenantScopedPrismaProvider: Provider = {
  provide: TENANT_SCOPED_PRISMA,
  useFactory: (prisma: PrismaService) => createTenantScopedClient(prisma),
  inject: [PrismaService],
};
