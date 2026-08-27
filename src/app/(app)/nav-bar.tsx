"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";

type NavItem = { href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: "🏠" },
  { href: "/notas", label: "NF-e", icon: "📄" },
  { href: "/notas-servico", label: "NFS-e", icon: "🧾" },
  { href: "/empresas", label: "Empresas", icon: "🏢" },
  { href: "/sincronizacao", label: "Sincronização", icon: "🔄" },
];

export function NavBar({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-semibold tracking-tight">
            Buscador NF CRM
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-accent text-white"
                      : "text-ink-secondary hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-ink-muted sm:inline" title={user.email}>
              {user.name}
            </span>
            <form action={logoutAction}>
              <button
                type="submit"
                className="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink-secondary"
              >
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface/95 backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-5xl items-stretch justify-around">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-ink-muted"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
