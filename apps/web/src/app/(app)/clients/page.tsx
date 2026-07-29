"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  document: string;
  city: string | null;
  state: string | null;
}

interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export default function ClientsPage() {
  const { user, accessToken, initialized } = useAuth();
  const router = useRouter();

  const [result, setResult] = useState<PaginatedResult<Client> | null>(null);
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
        const data = await apiFetch<PaginatedResult<Client>>("/clients", {
          token: accessToken,
        });
        if (!cancelled) {
          setResult(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof ApiError ? err.message : "Falha ao carregar clientes",
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
        Clientes
      </h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {!result ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Carregando clientes…
        </p>
      ) : result.data.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Nenhum cliente cadastrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Nome</th>
                <th className="px-4 py-2 font-medium">Documento</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Telefone</th>
                <th className="px-4 py-2 font-medium">Cidade/UF</th>
              </tr>
            </thead>
            <tbody>
              {result.data.map((client) => (
                <tr
                  key={client.id}
                  className="border-b border-zinc-100 last:border-0 dark:border-zinc-900"
                >
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    {client.name}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {client.document}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {client.email}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {client.phone ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-700 dark:text-zinc-300">
                    {client.city ? `${client.city}/${client.state ?? "—"}` : "—"}
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
