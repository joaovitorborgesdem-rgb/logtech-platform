import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import { runWithTenantContext } from "./tenant-context";

@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();

    if (!request.user) {
      return next.handle();
    }

    const tenantContext = {
      tenantId: request.user.tenantId,
      userId: request.user.id,
      role: request.user.role,
    };

    return new Observable((subscriber) => {
      runWithTenantContext(tenantContext, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}
