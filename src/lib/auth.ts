import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
};

// `cache` deduplica a consulta por requisição: layout e página podem chamar
// getCurrentUser() sem gerar duas consultas ao banco.
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, active: true },
  });
  if (!user || !user.active) return null;

  return { id: user.id, name: user.name, email: user.email };
});

/** Garante que existe um usuário logado; redireciona para /login caso contrário. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}
