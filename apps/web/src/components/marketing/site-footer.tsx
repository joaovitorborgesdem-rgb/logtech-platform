import Link from "next/link";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 dark:text-zinc-400 sm:flex-row sm:items-center sm:justify-between">
        <p>© {year} LogiSense. Todos os direitos reservados.</p>

        <nav className="flex gap-6">
          <a href="#features" className="hover:text-zinc-900 dark:hover:text-zinc-50">
            Recursos
          </a>
          <a href="#pricing" className="hover:text-zinc-900 dark:hover:text-zinc-50">
            Preços
          </a>
          <Link href="/login" className="hover:text-zinc-900 dark:hover:text-zinc-50">
            Entrar
          </Link>
        </nav>
      </div>
    </footer>
  );
}
