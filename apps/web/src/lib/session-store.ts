export interface StoredAuthUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
}

export interface StoredSession {
  user: StoredAuthUser;
  accessToken: string;
  refreshToken: string;
}

const STORAGE_KEY = "logisense.auth";

type Listener = () => void;
const listeners = new Set<Listener>();
let cachedSnapshot: StoredSession | null | undefined;

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function getSnapshot(): StoredSession | null {
  if (cachedSnapshot === undefined) {
    cachedSnapshot = readSession();
  }
  return cachedSnapshot;
}

export function getServerSnapshot(): StoredSession | null {
  return null;
}

export function setSession(session: StoredSession | null): void {
  cachedSnapshot = session;
  if (typeof window !== "undefined") {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }
  listeners.forEach((listener) => listener());
}

export function subscribeSession(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
