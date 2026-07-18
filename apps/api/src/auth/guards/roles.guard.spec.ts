import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { RolesGuard } from "./roles.guard";

function createContext(user?: { role: UserRole }): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("permite acesso quando a rota não exige roles", () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext({ role: UserRole.MEMBER }))).toBe(
      true,
    );
  });

  it("permite acesso quando o usuário possui uma das roles exigidas", () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.ADMIN, UserRole.OWNER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext({ role: UserRole.ADMIN }))).toBe(
      true,
    );
  });

  it("nega acesso quando o usuário não possui nenhuma das roles exigidas", () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.OWNER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext({ role: UserRole.MEMBER }))).toBe(
      false,
    );
  });

  it("nega acesso quando não há usuário autenticado", () => {
    const reflector = {
      getAllAndOverride: () => [UserRole.MEMBER],
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(createContext(undefined))).toBe(false);
  });
});
