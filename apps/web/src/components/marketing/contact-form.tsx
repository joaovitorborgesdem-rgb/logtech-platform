"use client";

import { FormEvent, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api-client";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await apiFetch("/leads", {
        method: "POST",
        body: {
          name,
          email,
          company: company || undefined,
          message: message || undefined,
        },
      });
      setIsSubmitted(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Não foi possível enviar sua mensagem",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <p className="text-center text-zinc-900 dark:text-zinc-50">
        Obrigado! Recebemos seu contato e vamos responder em breve.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid w-full max-w-lg gap-4"
    >
      <div>
        <label
          htmlFor="contact-name"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Nome
        </label>
        <input
          id="contact-name"
          type="text"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label
          htmlFor="contact-email"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          E-mail
        </label>
        <input
          id="contact-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label
          htmlFor="contact-company"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Empresa (opcional)
        </label>
        <input
          id="contact-company"
          type="text"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div>
        <label
          htmlFor="contact-message"
          className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Mensagem (opcional)
        </label>
        <textarea
          id="contact-message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {isSubmitting ? "Enviando..." : "Enviar mensagem"}
      </button>
    </form>
  );
}
