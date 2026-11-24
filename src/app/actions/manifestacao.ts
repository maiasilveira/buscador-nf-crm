"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertAdmin, requireUser } from "@/lib/auth";
import { retentarManifestacao } from "@/lib/sefaz/sync";
import { registrarAuditoria } from "@/lib/audit";

// Backfill retroativo: reenvia a manifestação de ciência pras NF-e presas
// em "Resumo" (XML completo nunca liberado pela SEFAZ) — seja porque a
// primeira tentativa falhou (ver NotaFiscal.manifestacaoErro) ou nunca
// chegou a rodar. Mesmo padrão de src/app/actions/pdfs.ts: processa em
// lotes pequenos (função serverless com tempo de execução limitado), o
// componente cliente chama repetidamente — ver retentar-manifestacoes-button.tsx.
//
// Diferença importante do backfill de PDF: uma manifestação aceita NÃO tira
// a nota de "Resumo" na hora — isso só acontece na *próxima* sincronização
// normal, quando a Distribuição DFe finalmente entrega o procNFe. Por isso
// não dá pra usar "restantes == 0" pra parar o loop (a mesma nota recém
// aceita continuaria aparecendo como pendente e o botão ficaria retentando
// ela pra sempre). Em vez disso, pagina por cursor (id) — cada chamada
// avança pro próximo lote de notas presas, e o loop para quando um lote vem
// menor que LOTE (fim da varredura atual), não quando `restantes` zera.

const LOTE = 8;

export type ResultadoRetentativaManifestacao = {
  processadas: number;
  sucesso: number;
  restantes: number; // total ainda em "Resumo" agora — informativo, não controla o loop
  proximoCursor: string | null; // id pra continuar a varredura; null = chegou ao fim do lote atual
};

/** Conta quantas NF-e ainda estão presas em "Resumo" — usado pra mostrar o
 * botão só quando existe algo pra tentar de novo. */
export async function contarManifestacoesPendentesAction(): Promise<number> {
  const usuario = await requireUser();
  assertAdmin(usuario);
  return prisma.notaFiscal.count({ where: { status: "RESUMO" } });
}

export async function retentarManifestacoesAction(
  cursorId?: string
): Promise<ResultadoRetentativaManifestacao> {
  const usuario = await requireUser();
  assertAdmin(usuario);

  const notas = await prisma.notaFiscal.findMany({
    where: { status: "RESUMO" },
    orderBy: { id: "asc" },
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    take: LOTE,
    select: { id: true },
  });

  let sucesso = 0;
  for (const nota of notas) {
    const ok = await retentarManifestacao(nota.id);
    if (ok) sucesso++;
  }

  const restantes = await contarManifestacoesPendentesAction();
  const proximoCursor = notas.length === LOTE ? notas[notas.length - 1].id : null;

  if (notas.length > 0) {
    await registrarAuditoria({
      userId: usuario.id,
      action: "MANIFESTACOES_RETENTADAS",
      detalhes: `Lote: ${sucesso}/${notas.length} manifestações aceitas — ${restantes} ainda em "Resumo"`,
    });
  }

  revalidatePath("/sincronizacao");
  revalidatePath("/notas");

  return { processadas: notas.length, sucesso, restantes, proximoCursor };
}
