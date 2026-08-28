import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import type { UserRole } from "@/lib/types";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

// `cache` deduplica a consulta por requisição: layout e página podem chamar
// getCurrentUser() sem gerar duas consultas ao banco.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, active: true, role: true },
  });
  if (!user || !user.active) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role as UserRole };
});

/** Garante que existe um usuário logado; redireciona para /login caso contrário. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Garante que existe um usuário logado com papel ADMIN; usuários "CONSULTA"
 * são redirecionados pro início. Use em componentes de página — em Server
 * Actions, prefira `assertAdmin` (lança erro em vez de navegar). */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    redirect("/");
  }
  return user;
}

/** Mesma checagem de `requireAdmin`, mas lançando um erro em vez de
 * redirecionar — para uso dentro de Server Actions, cujo tratamento de
 * erro (mensagem inline, sem navegação) é diferente do de uma página. */
export function assertAdmin(user: CurrentUser) {
  if (user.role !== "ADMIN") {
    throw new Error("Só administradores podem fazer isso.");
  }
}
