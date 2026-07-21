import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { Observable, tap } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { getTenantContext } from "../tenant/tenant-context";

const AUDITED_METHODS = new Set(["POST", "PATCH", "PUT"]);

/**
 * Rotas fora do escopo de auditoria genérica: `/auth` já registra suas
 * próprias ações específicas (REGISTER, LOGIN_SUCCESS, LOGOUT...) e
 * `/webhooks` já registra EXTERNAL_WEBHOOK_RECEIVED explicitamente — logar
 * aqui também duplicaria a entrada.
 */
const EXCLUDED_PATH_PREFIXES = ["/auth", "/webhooks"];

interface AuditableRequest {
  method: string;
  originalUrl?: string;
  route?: { path?: string };
  params?: Record<string, string>;
}

function resolveResource(path: string): string {
  const [, resource] = path.split("/");
  return resource ?? path;
}

function extractEntityId(
  request: AuditableRequest,
  response: unknown,
): string | undefined {
  if (request.params?.id) {
    return request.params.id;
  }

  if (response && typeof response === "object" && "id" in response) {
    const { id } = response;
    return typeof id === "string" ? id : undefined;
  }

  return undefined;
}

/**
 * Captura automaticamente toda mutação (POST/PATCH/PUT) bem-sucedida da API
 * como um `AuditLog` genérico (`HTTP_MUTATION`), sem exigir que cada service
 * de domínio lembre de chamar `auditLog.create` — ver ADR-012. Convive com
 * os registros específicos já existentes (ex.: `CARRIER_DELETED`) em vez de
 * substituí-los: `DELETE` é deliberadamente ignorado aqui porque os services
 * de domínio já auditam remoção com metadata mais rica.
 */
@Injectable()
export class MutationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MutationAuditInterceptor.name);

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuditableRequest>();
    const method = request.method?.toUpperCase();
    const path = request.route?.path ?? request.originalUrl ?? "";

    if (
      !AUDITED_METHODS.has(method) ||
      EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      tap((response: unknown) => {
        void this.recordMutation(request, method, path, response);
      }),
    );
  }

  private async recordMutation(
    request: AuditableRequest,
    method: string,
    path: string,
    response: unknown,
  ): Promise<void> {
    const tenantContext = getTenantContext();
    if (!tenantContext) {
      return;
    }

    const resource = resolveResource(path);
    const entityId = extractEntityId(request, response);

    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: tenantContext.tenantId,
          userId: tenantContext.userId,
          action: AuditAction.HTTP_MUTATION,
          description: `${method} ${path}`,
          metadata: { method, path, resource, entityId },
        },
      });
    } catch (error) {
      this.logger.error(
        `Falha ao registrar auditoria automática para ${method} ${path}`,
        error as Error,
      );
    }
  }
}
