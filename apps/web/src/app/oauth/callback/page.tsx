"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function OAuthCallbackContent() {
  const { exchangeOAuthCode } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;

    exchangeOAuthCode(code)
      .then((result) => {
        if ("mfaRequired" in result) {
          router.replace(
            `/mfa/verify?mfaToken=${encodeURIComponent(result.mfaToken)}`,
          );
          return;
        }
        router.replace("/freight-quotes/new");
      })
      .catch((err: unknown) => {
        setError(
          err instanceof ApiError
            ? err.message
            : "Não foi possível concluir o login social",
        );
      });
  }, [code, exchangeOAuthCode, router]);

  if (!code) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
        <p className="text-sm text-red-600 dark:text-red-400">
          Código de autenticação ausente
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Concluindo login...
        </p>
      )}
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <OAuthCallbackContent />
    </Suspense>
  );
}
