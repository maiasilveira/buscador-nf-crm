"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sincronizarEmpresa, sincronizarTodasEmpresas } from "@/lib/sefaz/sync";

export async function sincronizarTodasAction() {
  await requireUser();
  await sincronizarTodasEmpresas();
  revalidatePath("/sincronizacao");
  revalidatePath("/notas");
  revalidatePath("/");
}

export async function sincronizarEmpresaAction(empresaId: string) {
  await requireUser();
  await sincronizarEmpresa(empresaId);
  revalidatePath("/sincronizacao");
  revalidatePath("/notas");
  revalidatePath("/");
}
