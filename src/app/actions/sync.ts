"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sincronizarEmpresa, sincronizarTodasEmpresas } from "@/lib/sefaz/sync";
import { sincronizarNfseEmpresa, sincronizarNfseTodasEmpresas } from "@/lib/nfse/sync";
import { registrarAuditoria } from "@/lib/audit";

function revalidarTudo() {
  revalidatePath("/sincronizacao");
  revalidatePath("/notas");
  revalidatePath("/notas-servico");
  revalidatePath("/");
}

export async function sincronizarTodasAction() {
  const usuario = await requireUser();
  await registrarAuditoria({
    userId: usuario.id,
    action: "SYNC_DISPARADA_MANUAL",
    detalhes: "Todas as empresas",
  });
  await sincronizarTodasEmpresas();
  await sincronizarNfseTodasEmpresas();
  revalidarTudo();
}

export async function sincronizarEmpresaAction(empresaId: string) {
  const usuario = await requireUser();
  await registrarAuditoria({
    userId: usuario.id,
    action: "SYNC_DISPARADA_MANUAL",
    targetType: "Empresa",
    targetId: empresaId,
  });
  await sincronizarEmpresa(empresaId);
  await sincronizarNfseEmpresa(empresaId);
  revalidarTudo();
}
