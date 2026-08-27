"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatCnpj, isValidCnpj, onlyDigits } from "@/lib/cnpj";
import { encryptBuffer, encryptString } from "@/lib/crypto";
import { validarCertificadoPfx } from "@/lib/sefaz/cert";
import { UF_CODES } from "@/lib/types";

export type EmpresaFormState = { error?: string } | undefined;

async function lerCertificadoDoFormulario(formData: FormData) {
  const certFile = formData.get("certPfx");
  const certPassword = String(formData.get("certPassword") ?? "");

  if (!(certFile instanceof File) || certFile.size === 0) {
    return null; // nenhum certificado novo enviado (ex: edição sem trocar o certificado)
  }
  if (!certPassword) {
    throw new Error("Informe a senha do certificado.");
  }

  const pfxBuffer = Buffer.from(await certFile.arrayBuffer());
  const info = validarCertificadoPfx(pfxBuffer, certPassword); // lança erro claro se inválido

  return {
    certPfxEnc: encryptBuffer(pfxBuffer),
    certPasswordEnc: encryptString(certPassword),
    certSubject: info.subject,
    certValidUntil: info.validUntil,
  };
}

export async function criarEmpresaAction(
  _prevState: EmpresaFormState,
  formData: FormData
): Promise<EmpresaFormState> {
  await requireUser();

  const cnpj = onlyDigits(String(formData.get("cnpj") ?? ""));
  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase();
  const ambiente = String(formData.get("ambiente") ?? "PRODUCAO");

  if (!isValidCnpj(cnpj)) return { error: "CNPJ inválido." };
  if (!razaoSocial) return { error: "Informe a razão social." };
  if (!UF_CODES[uf]) return { error: "Selecione uma UF válida." };
  if (ambiente !== "PRODUCAO" && ambiente !== "HOMOLOGACAO") {
    return { error: "Ambiente inválido." };
  }

  const existente = await prisma.empresa.findUnique({ where: { cnpj } });
  if (existente) return { error: "Já existe uma empresa cadastrada com esse CNPJ." };

  let certificado;
  try {
    certificado = await lerCertificadoDoFormulario(formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.empresa.create({
    data: {
      cnpj,
      razaoSocial,
      uf,
      ambiente,
      ...certificado,
    },
  });

  revalidatePath("/empresas");
  return undefined;
}

export async function atualizarEmpresaAction(
  empresaId: string,
  _prevState: EmpresaFormState,
  formData: FormData
): Promise<EmpresaFormState> {
  await requireUser();

  const razaoSocial = String(formData.get("razaoSocial") ?? "").trim();
  const uf = String(formData.get("uf") ?? "").trim().toUpperCase();
  const ambiente = String(formData.get("ambiente") ?? "PRODUCAO");

  if (!razaoSocial) return { error: "Informe a razão social." };
  if (!UF_CODES[uf]) return { error: "Selecione uma UF válida." };
  if (ambiente !== "PRODUCAO" && ambiente !== "HOMOLOGACAO") {
    return { error: "Ambiente inválido." };
  }

  let certificado;
  try {
    certificado = await lerCertificadoDoFormulario(formData);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  await prisma.empresa.update({
    where: { id: empresaId },
    data: { razaoSocial, uf, ambiente, ...certificado },
  });

  revalidatePath("/empresas");
  return undefined;
}

export async function alternarAtivaEmpresaAction(empresaId: string) {
  await requireUser();
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });
  await prisma.empresa.update({
    where: { id: empresaId },
    data: { active: !empresa.active },
  });
  revalidatePath("/empresas");
}

export async function excluirEmpresaAction(empresaId: string) {
  await requireUser();
  const [notas, notasServico] = await Promise.all([
    prisma.notaFiscal.count({ where: { empresaId } }),
    prisma.notaServico.count({ where: { empresaId } }),
  ]);
  if (notas > 0 || notasServico > 0) {
    throw new Error(
      "Não é possível excluir uma empresa que já tem notas fiscais coletadas — desative-a."
    );
  }
  await prisma.empresa.delete({ where: { id: empresaId } });
  revalidatePath("/empresas");
}

export { formatCnpj };
