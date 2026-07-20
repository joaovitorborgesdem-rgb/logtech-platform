import { AsyncLocalStorage } from "node:async_hooks";
import { UserRole } from "@prisma/client";

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenantContext<T>(
  context: TenantContext,
  callback: () => T,
): T {
  return storage.run(context, callback);
}

export function getTenantContext(): TenantContext | undefined {
  return storage.getStore();
}
