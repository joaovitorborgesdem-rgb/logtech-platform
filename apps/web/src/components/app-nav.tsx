"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/freight-quotes/new", label: "Simulação de Frete" },
  { href: "/clients", label: "Clientes" },
  { href: "/carriers", label: "Transportadoras" },
  { href: "/settings/security", label: "Configurações de Segurança" },
];

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  if (!user) {
    return null;
  }

  return (
    <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/dashboard"
          className="text-lg font-semibold text-zinc-900 dark:text-zinc-50"
        >
          LogiSense
        </Link>

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-medium text-zinc-600 dark:text-zinc-400">
          {NAV_LINKS.map((link) => {
            const isActive = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "text-zinc-900 dark:text-zinc-50"
                    : "transition-colors hover:text-zinc-900 dark:hover:text-zinc-50"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3 text-sm">
          {user && (
            <span className="hidden text-zinc-500 dark:text-zinc-400 sm:inline">
              {user.name}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
