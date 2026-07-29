"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface Carrier {
  id: string;
  name: string;
  document: string;
  city: string | null;
  state: string | null;
  active: boolean;
}

interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export default function CarriersPage() {
  const { user, accessToken, initialized } = useAuth();
  const router = useRouter();

  const [result, setResult] = useState<PaginatedResult<Carrier> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialized && !user) {
      router.push("/login");
    }
  }, [initialized, user, router]);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    async function load() {
      try {
        const data = await apiFetch<PaginatedResult<Carrier>>("/carriers", {
          token: accessToken,
        });
        if (!cancelled) {
          setResult(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : "Falha ao carregar transportadoras",
          );
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Transportadoras
      </h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!result ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Carregando transportadoras…
        </p>
      ) : result.data.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nenhuma transportadora cadastrada.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Cidade/UF</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((carrier) => (
                <tr
                  key={carrier.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    {carrier.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {carrier.document}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {carrier.city
                      ? `${carrier.city}/${carrier.state ?? "—"}`
                      : "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        carrier.active
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-400 dark:text-zinc-500"
                      }
                    >
                      {carrier.active ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
