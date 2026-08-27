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
  if (!user || !user.active) {
    return { error: "E-mail ou senha incorretos." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "E-mail ou senha incorretos." };
  }

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
