import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

export type RequestWithTenantHint = Request & { tenantSlugHint?: string };

const IGNORED_SUBDOMAINS = new Set(["www", "api"]);

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: RequestWithTenantHint, _res: Response, next: NextFunction) {
    const headerHint = req.header("x-tenant-id");
    if (headerHint) {
      req.tenantSlugHint = headerHint;
      return next();
    }

    const hostname = (req.header("host") ?? "").split(":")[0];
    const labels = hostname.split(".");
    const [subdomain] = labels;

    if (labels.length > 2 && subdomain && !IGNORED_SUBDOMAINS.has(subdomain)) {
      req.tenantSlugHint = subdomain;
    }

    next();
  }
}
