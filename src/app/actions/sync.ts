"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sincronizarEmpresa, sincronizarTodasEmpresas } from "@/lib/sefaz/sync";
import { sincronizarNfseEmpresa, sincronizarNfseTodasEmpresas } from "@/lib/nfse/sync";

function revalidarTudo() {
  revalidatePath("/sincronizacao");
  revalidatePath("/notas");
  revalidatePath("/notas-servico");
  revalidatePath("/");
}

export async function sincronizarTodasAction() {
  await requireUser();
  await sincronizarTodasEmpresas();
  await sincronizarNfseTodasEmpresas();
  revalidarTudo();
}

export async function sincronizarEmpresaAction(empresaId: string) {
  await requireUser();
  await sincronizarEmpresa(empresaId);
  await sincronizarNfseEmpresa(empresaId);
  revalidarTudo();
}
