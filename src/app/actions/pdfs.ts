"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAdmin, requireUser } from "@/lib/auth";
import { anexarDanfeSeDisponivel } from "@/lib/sefaz/sync";
import { anexarDanfseSeDisponivel } from "@/lib/nfse/sync";
import { registrarAuditoria } from "@/lib/audit";

// Backfill retroativo: gera e anexa o PDF (DANFE/DANFSe) nas notas que já
// foram coletadas antes desse recurso existir (ou que falharam na hora de
// anexar durante a sincronização normal). Processa em lotes pequenos —
// cada chamada é uma função serverless da Vercel com tempo de execução
// limitado, e uma conta com muitas notas pendentes (ex: centenas) não cabe
// numa invocação só. O componente cliente chama essa action repetidamente
// até `restantes` chegar a 0 — ver gerar-pdfs-retroativos-button.tsx.

const LOTE = 8;

export type ResultadoBackfillPdfs = {
  processadasNfe: number;
  sucessoNfe: number;
  processadasNfse: number;
  sucessoNfse: number;
  restantes: number;
};

/** Conta quantas notas ainda não têm o PDF anexado — usado pra mostrar o
 * botão só quando faz sentido (existe algo pra processar) e pro estado
 * inicial da barra de progresso, sem precisar rodar um lote primeiro. */
export async function contarPdfsPendentesAction(): Promise<number> {
  const usuario = await requireUser();
  assertAdmin(usuario);
  const [nfe, nfse] = await Promise.all([
    prisma.notaFiscal.count({
      where: { status: "COMPLETA", clickupTaskId: { not: null }, pdfAnexado: false },
    }),
    prisma.notaServico.count({ where: { clickupTaskId: { not: null }, pdfAnexado: false } }),
  ]);
  return nfe + nfse;
}

export async function gerarPdfsRetroativosAction(): Promise<ResultadoBackfillPdfs> {
  const usuario = await requireUser();
  assertAdmin(usuario);

  const notasNfe = await prisma.notaFiscal.findMany({
    where: { status: "COMPLETA", clickupTaskId: { not: null }, pdfAnexado: false },
    take: LOTE,
    select: { id: true, clickupTaskId: true, chaveAcesso: true, xmlCompleto: true },
  });
  let sucessoNfe = 0;
  for (const nota of notasNfe) {
    // clickupTaskId e xmlCompleto não são null aqui — filtrados na query
    // acima (status COMPLETA implica xmlCompleto preenchido, ver
    // src/lib/sefaz/sync.ts).
    const ok = await anexarDanfeSeDisponivel(
      nota.id,
      nota.clickupTaskId as string,
      nota.chaveAcesso,
      nota.xmlCompleto as string
    );
    if (ok) sucessoNfe++;
  }

  const notasNfse = await prisma.notaServico.findMany({
    where: { clickupTaskId: { not: null }, pdfAnexado: false },
    take: LOTE,
    select: { id: true, clickupTaskId: true, chaveAcesso: true, xmlCompleto: true },
  });
  let sucessoNfse = 0;
  for (const nota of notasNfse) {
    const ok = await anexarDanfseSeDisponivel(
      nota.id,
      nota.clickupTaskId as string,
      nota.chaveAcesso,
      nota.xmlCompleto
    );
    if (ok) sucessoNfse++;
  }

  const restantes = await contarPdfsPendentesAction();

  if (notasNfe.length + notasNfse.length > 0) {
    await registrarAuditoria({
      userId: usuario.id,
      action: "PDFS_RETROATIVOS_GERADOS",
      detalhes: `Lote: ${sucessoNfe}/${notasNfe.length} NF-e, ${sucessoNfse}/${notasNfse.length} NFS-e — ${restantes} restante(s)`,
    });
  }

  revalidatePath("/sincronizacao");
  revalidatePath("/notas");
  revalidatePath("/notas-servico");

  return {
    processadasNfe: notasNfe.length,
    sucessoNfe,
    processadasNfse: notasNfse.length,
    sucessoNfse,
    restantes,
  };
}
