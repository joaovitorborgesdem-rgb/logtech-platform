import { CallHandler, ExecutionContext } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { of } from "rxjs";
import { AuthenticatedUser } from "../auth/interfaces/jwt-payload.interface";
import { getTenantContext } from "./tenant-context";
import { TenantContextInterceptor } from "./tenant-context.interceptor";

function createContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("TenantContextInterceptor", () => {
  const interceptor = new TenantContextInterceptor();

  it("executa o handler sem contexto de tenant quando não há usuário autenticado", (done) => {
    const context = createContext(undefined);
    const handler: CallHandler = {
      handle: () => {
        expect(getTenantContext()).toBeUndefined();
        return of("result");
      },
    };

    interceptor.intercept(context, handler).subscribe((value) => {
      expect(value).toBe("result");
      done();
    });
  });

  it("disponibiliza o contexto de tenant durante o handler quando há usuário autenticado", (done) => {
    const user: AuthenticatedUser = {
      id: "user-1",
      tenantId: "tenant-1",
      role: UserRole.OWNER,
    };
    const context = createContext(user);
    const handler: CallHandler = {
      handle: () => {
        expect(getTenantContext()).toEqual({
          tenantId: user.tenantId,
          userId: user.id,
          role: user.role,
        });
        return of("result");
      },
    };

    interceptor.intercept(context, handler).subscribe((value) => {
      expect(value).toBe("result");
      done();
    });
  });
});
