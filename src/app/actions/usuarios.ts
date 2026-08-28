"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAdmin, requireUser } from "@/lib/auth";
import { hashPassword, isValidPassword } from "@/lib/password";
import { registrarAuditoria } from "@/lib/audit";
import type { UserRole } from "@/lib/types";

export type UsuarioFormState = { error?: string } | undefined;

function isUserRole(value: unknown): value is UserRole {
  return value === "ADMIN" || value === "CONSULTA";
}

async function contarAdminsAtivos(): Promise<number> {
  return prisma.user.count({ where: { active: true, role: "ADMIN" } });
}

export async function criarUsuarioAction(
  _prevState: UsuarioFormState,
  formData: FormData
): Promise<UsuarioFormState> {
  const usuario = await requireUser();
  assertAdmin(usuario);

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleRaw = String(formData.get("role") ?? "CONSULTA");
  const role: UserRole = isUserRole(roleRaw) ? roleRaw : "CONSULTA";

  if (!name) return { error: "Digite o nome." };
  if (!email.includes("@")) return { error: "Digite um e-mail válido." };
  if (!isValidPassword(password)) return { error: "A senha precisa ter pelo menos 8 caracteres." };

  const existente = await prisma.user.findUnique({ where: { email } });
  if (existente) return { error: "Já existe um usuário com esse e-mail." };

  const novoUsuario = await prisma.user.create({
    data: { name, email, role, passwordHash: await hashPassword(password) },
  });

  await registrarAuditoria({
    userId: usuario.id,
    action: "USUARIO_CRIADO",
    targetType: "User",
    targetId: novoUsuario.id,
    detalhes: `${name} (${email}), papel ${role}, criado por ${usuario.name}`,
  });

  revalidatePath("/usuarios");
  return undefined;
}

/** Ativa/desativa um usuário — nunca deixa desativar o último administrador
 * ativo do sistema (usuário "CONSULTA" pode ser desativado livremente, não
 * há risco de travar o acesso administrativo). */
export async function alternarAtivoUsuarioAction(userId: string) {
  const usuario = await requireUser();
  assertAdmin(usuario);
  const alvo = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (alvo.active && alvo.role === "ADMIN") {
    const admins = await contarAdminsAtivos();
    if (admins <= 1) {
      throw new Error("Não é possível desativar o único administrador ativo do sistema.");
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

/** Promove/rebaixa um usuário entre ADMIN e CONSULTA — mesma trava: nunca
 * deixa rebaixar o último administrador ativo. */
export async function alterarPapelUsuarioAction(userId: string, novoPapel: UserRole) {
  const usuario = await requireUser();
  assertAdmin(usuario);
  const alvo = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  if (alvo.active && alvo.role === "ADMIN" && novoPapel === "CONSULTA") {
    const admins = await contarAdminsAtivos();
    if (admins <= 1) {
      throw new Error("Não é possível rebaixar o único administrador ativo do sistema.");
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role: novoPapel } });

  await registrarAuditoria({
    userId: usuario.id,
    action: "USUARIO_PAPEL_ALTERADO",
    targetType: "User",
    targetId: userId,
    detalhes: `${alvo.name} (${alvo.email}) agora é ${novoPapel === "ADMIN" ? "administrador" : "consulta"}, alterado por ${usuario.name}`,
  });

  revalidatePath("/usuarios");
}

export type RedefinirSenhaState = { error?: string; ok?: boolean } | undefined;

/** Um administrador redefine a senha de um usuário (não há fluxo de
 * "esqueci minha senha" por e-mail — o app não envia e-mail nenhum). */
export async function redefinirSenhaUsuarioAction(
  userId: string,
  _prevState: RedefinirSenhaState,
  formData: FormData
): Promise<RedefinirSenhaState> {
  const usuario = await requireUser();
  assertAdmin(usuario);
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
