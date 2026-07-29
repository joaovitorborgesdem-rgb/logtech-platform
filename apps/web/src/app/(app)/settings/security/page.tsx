"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { MfaSetupResult, useAuth } from "@/lib/auth-context";

export default function SecuritySettingsPage() {
  const { user, initialized, setupMfa, enableMfa, disableMfa } = useAuth();
  const router = useRouter();

  const [setup, setSetup] = useState<MfaSetupResult | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (initialized && !user) {
      router.push("/login");
    }
  }, [initialized, user, router]);

  async function handleStartSetup() {
    setError(null);
    try {
      setSetup(await setupMfa());
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Falha ao iniciar setup de MFA",
      );
    }
  }

  async function handleEnable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await enableMfa(code);
      setBackupCodes(result.backupCodes);
      setSetup(null);
      setCode("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDisable(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await disableMfa({ code: disableCode });
      setDisableCode("");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível desabilitar o MFA",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-10">
      <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Segurança da conta
      </h1>

      {error && (
        <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      {backupCodes && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-950">
          <p className="mb-2 font-medium text-amber-900 dark:text-amber-200">
            MFA habilitado. Guarde estes códigos de backup — cada um só pode
            ser usado uma vez e eles não serão mostrados novamente.
          </p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-amber-900 dark:text-amber-200">
            {backupCodes.map((backupCode) => (
              <li key={backupCode}>{backupCode}</li>
            ))}
          </ul>
        </div>
      )}

      {user.mfaEnabled ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">
            A verificação em duas etapas está habilitada nesta conta.
          </p>
          <form onSubmit={handleDisable}>
            <label
              htmlFor="disableCode"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Digite um código do autenticador para desabilitar
            </label>
            <input
              id="disableCode"
              type="text"
              required
              value={disableCode}
              onChange={(event) => setDisableCode(event.target.value)}
              className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
            >
              {isSubmitting ? "Desabilitando..." : "Desabilitar MFA"}
            </button>
          </form>
        </div>
      ) : !setup ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">
            Adicione uma camada extra de segurança exigindo um código do seu
            aplicativo autenticador (Google Authenticator, Authy, etc.) ao
            entrar.
          </p>
          <button
            type="button"
            onClick={() => void handleStartSetup()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            Habilitar MFA
          </button>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-4 text-sm text-zinc-700 dark:text-zinc-300">
            Escaneie o QR code com seu aplicativo autenticador e digite o
            código gerado para confirmar.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL, não é um asset otimizável pelo next/image */}
          <img
            src={setup.qrCodeDataUrl}
            alt="QR code para configurar o autenticador"
            className="mb-4 h-48 w-48"
          />
          <p className="mb-4 break-all font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {setup.secret}
          </p>

          <form onSubmit={handleEnable}>
            <label
              htmlFor="enableCode"
              className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Código do autenticador
            </label>
            <input
              id="enableCode"
              type="text"
              required
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="000000"
              className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isSubmitting ? "Confirmando..." : "Confirmar e habilitar"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
