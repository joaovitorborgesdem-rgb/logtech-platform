import { Response } from "express";
import { RequestWithTenantHint, TenantMiddleware } from "./tenant.middleware";

function createRequest(headers: Record<string, string>): RequestWithTenantHint {
  return {
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as RequestWithTenantHint;
}

describe("TenantMiddleware", () => {
  const middleware = new TenantMiddleware();

  it("usa o header x-tenant-id quando presente", () => {
    const req = createRequest({
      "x-tenant-id": "acme",
      host: "app.logisense.com",
    });
    const next = jest.fn();

    middleware.use(req, {} as Response, next);

    expect(req.tenantSlugHint).toBe("acme");
    expect(next).toHaveBeenCalled();
  });

  it("extrai o subdomínio do host quando não há header", () => {
    const req = createRequest({ host: "acme.logisense.app" });
    const next = jest.fn();

    middleware.use(req, {} as Response, next);

    expect(req.tenantSlugHint).toBe("acme");
    expect(next).toHaveBeenCalled();
  });

  it("ignora subdomínios reservados (www, api)", () => {
    const req = createRequest({ host: "api.logisense.app" });
    const next = jest.fn();

    middleware.use(req, {} as Response, next);

    expect(req.tenantSlugHint).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("não define hint quando o host não tem subdomínio", () => {
    const req = createRequest({ host: "localhost:3000" });
    const next = jest.fn();

    middleware.use(req, {} as Response, next);

    expect(req.tenantSlugHint).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });
});
