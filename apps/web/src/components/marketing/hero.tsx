import Link from "next/link";

export function Hero() {
  return (
    <section className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-24 text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-5xl">
        Inteligência logística para operações multi-tenant
      </h1>
      <p className="max-w-2xl text-lg text-zinc-600 dark:text-zinc-400">
        Cotação de frete automatizada, dashboard operacional em tempo real e
        insights de negócio — tudo numa única plataforma SaaS pensada para
        transportadoras e operadores logísticos.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Começar agora
        </Link>
        <a
          href="#features"
          className="rounded-md border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Ver recursos
        </a>
      </div>
    </section>
  );
}
