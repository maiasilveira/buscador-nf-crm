"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashPassword, isValidPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";

export type SetupState = { error?: string } | undefined;

/** Cria o primeiro usuário administrador. Os demais usuários são
 * adicionados depois em /usuarios. */
export async function setupAdminAction(
  _prevState: SetupState,
  formData: FormData
): Promise<SetupState> {
  const existing = await prisma.user.count();
  if (existing > 0) {
    redirect("/login");
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Digite seu nome." };
  if (!email.includes("@")) return { error: "Digite um e-mail válido." };
  if (!isValidPassword(password)) return { error: "A senha precisa ter pelo menos 8 caracteres." };

  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });

  await createSession(user.id);
  redirect("/");
}

export type LoginState = { error?: string } | undefined;

// Trava contra força bruta: depois de MAX_TENTATIVAS erradas seguidas, a
// conta fica bloqueada por LOCKOUT_MINUTOS — reseta a zero em qualquer
// login bem-sucedido. Persistido no banco (não em memória) porque o app
// roda em funções serverless sem estado compartilhado entre invocações.
const MAX_TENTATIVAS = 5;
const LOCKOUT_MINUTOS = 15;

export async function loginAction(
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Digite seu e-mail e senha." };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  // Mesma mensagem genérica em todos os casos de falha (conta inexistente,
  // inativa, bloqueada ou senha errada) — não dá pista de qual condição
  // se aplica.
  const erroGenerico = { error: "E-mail ou senha incorretos." };

  if (!user || !user.active) {
    return erroGenerico;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return {
      error: `Muitas tentativas incorretas. Tente novamente em alguns minutos.`,
    };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const tentativas = user.failedLoginAttempts + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: tentativas,
        lockedUntil:
          tentativas >= MAX_TENTATIVAS
            ? new Date(Date.now() + LOCKOUT_MINUTOS * 60 * 1000)
            : null,
      },
    });
    return erroGenerico;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
