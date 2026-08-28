"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { hashPassword, isValidPassword } from "@/lib/password";
import { registrarAuditoria } from "@/lib/audit";

export type UsuarioFormState = { error?: string } | undefined;

export async function criarUsuarioAction(
  _prevState: UsuarioFormState,
  formData: FormData
): Promise<UsuarioFormState> {
  const usuario = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!name) return { error: "Digite o nome." };
  if (!email.includes("@")) return { error: "Digite um e-mail válido." };
  if (!isValidPassword(password)) return { error: "A senha precisa ter pelo menos 8 caracteres." };

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) return { error: "Já existe um usuário com esse e-mail." };

  const novoUsuario = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password) },
  });

  await registrarAuditoria({
    userId: usuario.id,
    action: "USUARIO_CRIADO",
    targetType: "User",
    targetId: novoUsuario.id,
    detalhes: `${name} (${email}), criado por ${usuario.name}`,
  });

  revalidatePath("/usuarios");
  return undefined;
}

/** Ativa/desativa um usuário — nunca deixa desativar o último usuário
 * ativo (bloquearia o acesso de todo mundo ao sistema). */
export async function alternarAtivoUsuarioAction(userId: string) {
  const usuario = await requireUser();
  const alvo = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (alvo.active) {
    const ativos = await prisma.user.count({ where: { active: true } });
    if (ativos <= 1) {
      throw new Error("Não é possível desativar o único usuário ativo do sistema.");
    }
  }

  const novoEstado = !alvo.active;
  await prisma.user.update({ where: { id: userId }, data: { active: novoEstado } });

  await registrarAuditoria({
    userId: usuario.id,
    action: novoEstado ? "USUARIO_ATIVADO" : "USUARIO_DESATIVADO",
    targetType: "User",
    targetId: userId,
    detalhes: `${alvo.name} (${alvo.email}), por ${usuario.name}`,
  });

  revalidatePath("/usuarios");
}

export type RedefinirSenhaState = { error?: string; ok?: boolean } | undefined;

/** Um usuário logado redefine a senha de outro (não há fluxo de "esqueci
 * minha senha" por e-mail — o app não envia e-mail nenhum). */
export async function redefinirSenhaUsuarioAction(
  userId: string,
  _prevState: RedefinirSenhaState,
  formData: FormData
): Promise<RedefinirSenhaState> {
  const usuario = await requireUser();
  const novaSenha = String(formData.get("novaSenha") ?? "");

  if (!isValidPassword(novaSenha)) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }

  const alvo = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(novaSenha),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });

  await registrarAuditoria({
    userId: usuario.id,
    action: "USUARIO_SENHA_REDEFINIDA",
    targetType: "User",
    targetId: userId,
    detalhes: `Senha de ${alvo.name} (${alvo.email}) redefinida por ${usuario.name}`,
  });

  revalidatePath("/usuarios");
  return { ok: true };
}
