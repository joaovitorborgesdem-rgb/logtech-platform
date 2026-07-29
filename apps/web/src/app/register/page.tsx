"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Lighter than slugify(): only drops disallowed characters, without
// collapsing repeats or trimming a trailing hyphen — slugify() would strip
// a hyphen the moment it's typed (last character), making it impossible to
// type one in the middle of a slug via normal sequential keystrokes.
function sanitizeSlugInput(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleTenantNameChange(value: string) {
    setTenantName(value);
    if (!slugTouched) {
      setTenantSlug(slugify(value));
    }
  }

  function handleTenantSlugChange(value: string) {
    setSlugTouched(true);
    setTenantSlug(sanitizeSlugInput(value));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await register({ tenantName, tenantSlug, name, email, password });
      router.push("/freight-quotes/new");
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Não foi possível criar a conta",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
      >
        <h1 className="mb-6 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Criar conta no LogiSense
        </h1>

        <label
          htmlFor="tenantName"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Nome da empresa
        </label>
        <input
          id="tenantName"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={tenantName}
          onChange={(event) => handleTenantNameChange(event.target.value)}
          placeholder="Acme Transportes"
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <label
          htmlFor="tenantSlug"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Identificador do tenant
        </label>
        <input
          id="tenantSlug"
          type="text"
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          title="Apenas letras minúsculas, números e hífens"
          value={tenantSlug}
          onChange={(event) => handleTenantSlugChange(event.target.value)}
          placeholder="acme"
          className="mb-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
          Usado para entrar depois — só letras minúsculas, números e hífens.
        </p>

        <label
          htmlFor="name"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Seu nome
        </label>
        <input
          id="name"
          type="text"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <label
          htmlFor="email"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          E-mail
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mb-4 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />

        <label
          htmlFor="password"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Senha
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-6 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
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
          {isSubmitting ? "Criando conta..." : "Criar conta"}
        </button>

        <p className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Já tem uma conta?{" "}
          <a
            href="/login"
            className="font-medium text-blue-600 underline dark:text-blue-400"
          >
            Entrar
          </a>
        </p>
      </form>
    </div>
  );
}
