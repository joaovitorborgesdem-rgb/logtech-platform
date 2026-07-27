"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function MfaVerifyForm() {
  const { verifyMfa } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mfaToken = searchParams.get("mfaToken") ?? "";
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await verifyMfa({ mfaToken, code });
      router.push("/freight-quotes/new");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!mfaToken) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-sm text-red-600 dark:text-red-400">
          Sessão de verificação inválida. Volte para o login.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Verificação em duas etapas
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Digite o código do seu aplicativo autenticador ou um código de
          backup.
        </p>

        <label
          htmlFor="code"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Código
        </label>
        <input
          id="code"
          type="text"
          required
          autoFocus
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="000000"
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        {error && (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isSubmitting ? "Verificando..." : "Verificar"}
        </button>
      </form>
    </div>
  );
}

export default function MfaVerifyPage() {
  return (
    <Suspense fallback={null}>
      <MfaVerifyForm />
    </Suspense>
  );
}
