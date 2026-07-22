import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link
          href="/"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          LogiSense
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400 sm:flex">
          <a
            href="#features"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Recursos
          </a>
          <a
            href="#pricing"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Preços
          </a>
          <a
            href="#contact"
            className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
          >
            Contato
          </a>
        </nav>

        <Link
          href="/login"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          Entrar
        </Link>
      </div>
    </header>
  );
}
