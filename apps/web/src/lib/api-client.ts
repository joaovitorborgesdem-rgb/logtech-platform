import { getSnapshot, setSession } from "./session-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const HTTP_NO_CONTENT = 204;
const HTTP_UNAUTHORIZED = 401;
const REFRESH_TIMEOUT_MS = 10_000;
export const SESSION_EXPIRED_MESSAGE = "Sua sessão expirou. Faça login novamente.";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | boolean | undefined>;
}

function buildQueryString(
  query?: Record<string, string | number | boolean | undefined>,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

// Refresh tokens are rotated server-side (each use invalidates the previous
// one), so concurrent 401s must share a single in-flight refresh instead of
// each rotating it independently — otherwise all but the first would refresh
// with an already-revoked token and force a spurious logout.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const current = getSnapshot();
      if (!current) return null;

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REFRESH_TIMEOUT_MS,
      );

      let response: Response;
      try {
        response = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: current.refreshToken }),
          signal: controller.signal,
        });
      } catch {
        // Network error or timeout — a refresh that never settles must not
        // permanently block every future 401 retry sharing this promise.
        setSession(null);
        return null;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        setSession(null);
        return null;
      }

      const tokens = (await response.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      setSession({ ...current, ...tokens });
      return tokens.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function apiFetch<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  return apiFetchWithRefresh(path, options, /* allowRefresh */ true);
}

async function apiFetchWithRefresh<T>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean,
): Promise<T> {
  const { method = "GET", body, token, query } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}${buildQueryString(query)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === HTTP_NO_CONTENT) {
    return undefined as T;
  }

  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (response.status === HTTP_UNAUTHORIZED && allowRefresh && token) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return apiFetchWithRefresh(
          path,
          { ...options, token: newToken },
          false,
        );
      }
      // Refresh genuinely failed (expired/revoked refresh token, or the
      // refresh call itself timed out) — this is not recoverable by
      // retrying, so give callers one unambiguous message instead of
      // whatever the original 401 body happened to say.
      throw new ApiError(SESSION_EXPIRED_MESSAGE, HTTP_UNAUTHORIZED);
    }

    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Erro inesperado ao comunicar com a API";
    throw new ApiError(message, response.status);
  }

  return data as T;
}
