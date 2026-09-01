import "server-only";
import { prisma } from "@/lib/prisma";

// Trilha de auditoria — registra quem fez o quê, quando. Regra de ouro:
// `detalhes` é texto livre exibido na tela de Auditoria pra qualquer
// usuário logado — NUNCA passe senha, certificado, token ou qualquer outro
// segredo aqui, só identificadores/descrições (nome, e-mail, CNPJ, razão
// social).

export type AcaoAuditoria =
  | "LOGIN_SUCESSO"
  | "LOGIN_FALHA"
  | "LOGIN_BLOQUEADO"
  | "LOGOUT"
  | "USUARIO_CRIADO"
  | "USUARIO_ATIVADO"
  | "USUARIO_DESATIVADO"
  | "USUARIO_SENHA_REDEFINIDA"
  | "USUARIO_PAPEL_ALTERADO"
  | "EMPRESA_CRIADA"
  | "EMPRESA_EDITADA"
  | "CERTIFICADO_SUBSTITUIDO"
  | "EMPRESA_ATIVADA"
  | "EMPRESA_DESATIVADA"
  | "EMPRESA_EXCLUIDA"
  | "SYNC_DISPARADA_MANUAL"
  | "SYNC_DISPARADA_CRON"
  | "PDFS_RETROATIVOS_GERADOS";

/** Registra um evento de auditoria. Nunca lança — uma falha ao gravar o log
 * não pode derrubar a ação que estava sendo auditada (login, criação de
 * empresa etc.); só fica registrada no log do servidor. */
export async function registrarAuditoria(params: {
  userId: string | null;
  action: AcaoAuditoria;
  targetType?: string;
  targetId?: string;
  detalhes?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        detalhes: params.detalhes,
      },
    });
  } catch (err) {
    console.error("Falha ao gravar log de auditoria:", err);
  }
}
