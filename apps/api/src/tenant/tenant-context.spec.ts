import { UserRole } from "@prisma/client";
import { getTenantContext, runWithTenantContext } from "./tenant-context";

describe("tenant-context", () => {
  it("retorna undefined fora de um contexto ativo", () => {
    expect(getTenantContext()).toBeUndefined();
  });

  it("expõe o contexto dentro do callback", () => {
    const context = {
      tenantId: "tenant-1",
      userId: "user-1",
      role: UserRole.OWNER,
    };

    const result = runWithTenantContext(context, () => {
      expect(getTenantContext()).toEqual(context);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(getTenantContext()).toBeUndefined();
  });

  it("propaga o contexto através de continuações assíncronas", async () => {
    const context = {
      tenantId: "tenant-2",
      userId: "user-2",
      role: UserRole.MEMBER,
    };

    await runWithTenantContext(context, async () => {
      await Promise.resolve();
      expect(getTenantContext()).toEqual(context);
    });
  });

  it("isola contextos de execuções concorrentes", async () => {
    const contextA = {
      tenantId: "tenant-a",
      userId: "user-a",
      role: UserRole.OWNER,
    };
    const contextB = {
      tenantId: "tenant-b",
      userId: "user-b",
      role: UserRole.MEMBER,
    };

    const runA = runWithTenantContext(contextA, async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return getTenantContext();
    });
    const runB = runWithTenantContext(contextB, () =>
      Promise.resolve(getTenantContext()),
    );

    const [resultA, resultB] = await Promise.all([runA, runB]);
    expect(resultA).toEqual(contextA);
    expect(resultB).toEqual(contextB);
  });
});
