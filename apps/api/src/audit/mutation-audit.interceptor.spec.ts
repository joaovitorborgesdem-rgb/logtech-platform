import { CallHandler, ExecutionContext } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { of } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import * as tenantContext from "../tenant/tenant-context";
import { MutationAuditInterceptor } from "./mutation-audit.interceptor";

describe("MutationAuditInterceptor", () => {
  let interceptor: MutationAuditInterceptor;
  let prisma: { auditLog: { create: jest.Mock } };
  let getTenantContextSpy: jest.SpyInstance;

  function buildContext(
    request: Record<string, unknown>,
    type: "http" | "ws" = "http",
  ): ExecutionContext {
    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  }

  function buildHandler(response: unknown): CallHandler {
    return { handle: () => of(response) };
  }

  async function flushMicrotasks(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
  }

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    interceptor = new MutationAuditInterceptor(
      prisma as unknown as PrismaService,
    );

    getTenantContextSpy = jest
      .spyOn(tenantContext, "getTenantContext")
      .mockReturnValue({
        tenantId: "tenant-1",
        userId: "user-1",
        role: UserRole.MEMBER,
      });
  });

  afterEach(() => {
    jest.clearAllMocks();
    getTenantContextSpy.mockRestore();
  });

  it("registra um AuditLog genérico para POST bem-sucedido", async () => {
    const request = {
      method: "POST",
      route: { path: "/carriers" },
      params: {},
    };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ id: "carrier-1" }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        userId: "user-1",
        action: "HTTP_MUTATION",
        description: "POST /carriers",
        metadata: {
          method: "POST",
          path: "/carriers",
          resource: "carriers",
          entityId: "carrier-1",
        },
      },
    });
  });

  it("usa o :id da rota para PATCH em vez do id da resposta", async () => {
    const request = {
      method: "PATCH",
      route: { path: "/carriers/:id" },
      params: { id: "carrier-1" },
    };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ id: "carrier-1", name: "Novo nome" }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    const [call] = prisma.auditLog.create.mock.calls as Array<
      [{ data: { metadata: { entityId: string } } }]
    >;
    expect(call[0].data.metadata.entityId).toBe("carrier-1");
  });

  it("não audita requisições GET", async () => {
    const request = { method: "GET", route: { path: "/carriers" } };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler([]),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("não audita requisições DELETE (já auditadas explicitamente pelos services)", async () => {
    const request = {
      method: "DELETE",
      route: { path: "/carriers/:id" },
      params: { id: "carrier-1" },
    };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler(undefined),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("não audita rotas de /auth", async () => {
    const request = { method: "POST", route: { path: "/auth/login" } };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ accessToken: "x" }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("não audita rotas de /webhooks", async () => {
    const request = {
      method: "POST",
      route: { path: "/webhooks/carriers/:tenantSlug" },
    };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ received: true }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("não audita quando não há contexto de tenant", async () => {
    getTenantContextSpy.mockReturnValue(undefined);
    const request = { method: "POST", route: { path: "/carriers" } };
    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ id: "carrier-1" }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("ignora contextos que não são HTTP (ex.: WebSocket)", async () => {
    const request = { method: "POST", route: { path: "/carriers" } };
    const response$ = interceptor.intercept(
      buildContext(request, "ws"),
      buildHandler({ id: "carrier-1" }),
    );

    await response$.toPromise();
    await flushMicrotasks();

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("não propaga erro do handler ao chamador quando a auditoria falha", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("db indisponível"));
    const request = { method: "POST", route: { path: "/carriers" } };

    const response$ = interceptor.intercept(
      buildContext(request),
      buildHandler({ id: "carrier-1" }),
    );

    await expect(response$.toPromise()).resolves.toEqual({
      id: "carrier-1",
    });
    await flushMicrotasks();
  });
});
