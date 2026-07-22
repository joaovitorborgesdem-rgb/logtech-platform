import { NextFunction, Request, Response } from "express";
import { MetricsMiddleware } from "./metrics.middleware";
import { MetricsRegistry } from "./metrics.registry";

describe("MetricsMiddleware", () => {
  let middleware: MetricsMiddleware;
  let registry: MetricsRegistry;
  let finishCallback: () => void;
  let req: Partial<Request>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    registry = new MetricsRegistry();
    middleware = new MetricsMiddleware(registry);

    req = { method: "GET", route: { path: "/carriers/:id" } as never };
    res = {
      statusCode: 200,
      on: jest.fn((event: string, cb: () => void) => {
        if (event === "finish") {
          finishCallback = cb;
        }
        return res as Response;
      }),
    };
    next = jest.fn();
  });

  it("chama next imediatamente", () => {
    middleware.use(req as Request, res as Response, next);
    expect(next).toHaveBeenCalled();
  });

  it("registra as métricas quando a resposta termina, usando a rota casada", async () => {
    middleware.use(req as Request, res as Response, next);
    finishCallback();

    const metrics = await registry.registry.metrics();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/carriers/:id",status_code="200"} 1',
    );
  });

  it("usa o rótulo 'unmatched' quando não há rota casada", async () => {
    req.route = undefined;
    middleware.use(req as Request, res as Response, next);
    finishCallback();

    const metrics = await registry.registry.metrics();
    expect(metrics).toContain(
      'http_requests_total{method="GET",route="unmatched",status_code="200"} 1',
    );
  });
});
