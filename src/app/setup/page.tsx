import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SetupForm } from "./setup-form";

// Esta página só lê o banco (sem cookies()), então o Next tentaria
// pré-renderizá-la estaticamente no build — o que congelaria a checagem de
// "já existe algum usuário?" com o estado do banco no momento do build.
// Forçamos renderização dinâmica para que essa checagem rode a cada
// requisição.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Buscador NF CRM</h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Antes de começar, crie o primeiro usuário administrador. Depois de
            entrar, você adiciona os CNPJs em &ldquo;Empresas&rdquo; e os
            demais usuários em &ldquo;Usuários&rdquo;.
          </p>
        </div>
        <SetupForm />
      </div>
    </div>
  );
}
