import { applyTenantScope } from "./tenant-scoped-prisma.provider";

describe("applyTenantScope", () => {
  const tenantId = "tenant-1";

  it("injeta tenantId em data no create de um modelo escopado", () => {
    const result = applyTenantScope(
      "Carrier",
      "create",
      { data: { name: "Transportadora X" } },
      tenantId,
    );

    expect(result.data).toEqual({ name: "Transportadora X", tenantId });
  });

  it("injeta tenantId em cada item no createMany", () => {
    const result = applyTenantScope(
      "Client",
      "createMany",
      { data: [{ name: "A" }, { name: "B" }] },
      tenantId,
    );

    expect(result.data).toEqual([
      { name: "A", tenantId },
      { name: "B", tenantId },
    ]);
  });

  it("injeta tenantId em where para leituras", () => {
    const result = applyTenantScope(
      "Carrier",
      "findMany",
      { where: { active: true } },
      tenantId,
    );

    expect(result.where).toEqual({ active: true, tenantId });
  });

  it("injeta tenantId em where para findUnique preservando o filtro original", () => {
    const result = applyTenantScope(
      "Client",
      "findUnique",
      { where: { id: "client-1" } },
      tenantId,
    );

    expect(result.where).toEqual({ id: "client-1", tenantId });
  });

  it("injeta tenantId em updateMany/deleteMany", () => {
    const updateResult = applyTenantScope(
      "Carrier",
      "updateMany",
      { where: { active: false } },
      tenantId,
    );
    const deleteResult = applyTenantScope(
      "Carrier",
      "deleteMany",
      {},
      tenantId,
    );

    expect(updateResult.where).toEqual({ active: false, tenantId });
    expect(deleteResult.where).toEqual({ tenantId });
  });

  it("não modifica modelos fora do escopo de tenant", () => {
    const args = { where: { id: "quote-option-1" } };
    const result = applyTenantScope(
      "FreightQuoteOption",
      "findMany",
      args,
      tenantId,
    );

    expect(result).toBe(args);
  });

  it("não modifica operações desconhecidas para modelos escopados", () => {
    const args = { where: { id: "carrier-1" } };
    const result = applyTenantScope("Carrier", "someUnknownOp", args, tenantId);

    expect(result).toBe(args);
  });

  it("não modifica quando model é undefined (ex.: $queryRaw)", () => {
    const args = { where: { id: "x" } };
    const result = applyTenantScope(undefined, "findMany", args, tenantId);

    expect(result).toBe(args);
  });
});
