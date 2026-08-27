import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/crypto";
import { consultarDistribuicaoNfse } from "@/lib/nfse/client";
import { parseNfse, type NotaServicoResumida } from "@/lib/nfse/parse";
import { criarTarefaNotaServico } from "@/lib/clickup";

const MAX_PAGINAS_POR_SYNC = 20;

export type ResultadoSyncNfse = {
  empresaId: string;
  notasNovas: number;
  erro?: string;
};

/** Sincroniza as NFS-e de uma empresa via o Ambiente de Dados Nacional
 * (ADN) — cobertura limitada aos municípios que já aderiram ao Sistema
 * Nacional NFS-e (veja README e o aviso em src/lib/nfse/client.ts). */
export async function sincronizarNfseEmpresa(empresaId: string): Promise<ResultadoSyncNfse> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

  const log = await prisma.syncLog.create({
    data: { empresaId, tipoDocumento: "NFSE", status: "EM_ANDAMENTO" },
  });

  let notasNovas = 0;

  try {
    if (!empresa.certPfxEnc || !empresa.certPasswordEnc) {
      throw new Error("Empresa sem certificado digital cadastrado.");
    }

    const pfx = decryptBuffer(empresa.certPfxEnc);
    const passphrase = decryptString(empresa.certPasswordEnc);

    let ultNsu = empresa.ultNsuNfse;
    let maxNsu = empresa.maxNsuNfse;
    let paginas = 0;

    do {
      const resposta = await consultarDistribuicaoNfse({
        cnpj: empresa.cnpj,
        ultNsu,
        pfx,
        passphrase,
      });

      for (const doc of resposta.documentos) {
        const resumo = parseNfse(doc.xml);
        const criada = await upsertNotaServico(empresaId, resumo, doc.xml);
        if (criada) notasNovas++;
      }

      ultNsu = resposta.ultNSU;
      maxNsu = resposta.maxNSU;
      paginas++;
    } while (ultNsu !== maxNsu && paginas < MAX_PAGINAS_POR_SYNC);

    await prisma.empresa.update({
      where: { id: empresaId },
      data: { ultNsuNfse: ultNsu, maxNsuNfse: maxNsu, lastSyncNfseAt: new Date(), lastSyncNfseError: null },
    });

    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "SUCESSO", finishedAt: new Date(), notasNovas },
    });

    return { empresaId, notasNovas };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    await prisma.empresa.update({
      where: { id: empresaId },
      data: { lastSyncNfseAt: new Date(), lastSyncNfseError: mensagem },
    });
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "ERRO", finishedAt: new Date(), notasNovas, mensagem },
    });
    return { empresaId, notasNovas, erro: mensagem };
  }
}

async function upsertNotaServico(
  empresaId: string,
  resumo: NotaServicoResumida,
  xmlCompleto: string
): Promise<boolean> {
  if (!resumo.chaveAcesso) return false; // documento sem chave — não deu pra identificar, ignora

  const existente = await prisma.notaServico.findUnique({
    where: { chaveAcesso: resumo.chaveAcesso },
  });
  if (existente) return false;

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

  const nota = await prisma.notaServico.create({
    data: {
      empresaId,
      chaveAcesso: resumo.chaveAcesso,
      nsu: "",
      numero: resumo.numero,
      prestadorCnpj: resumo.prestadorCnpj,
      prestadorNome: resumo.prestadorNome,
      tomadorCnpj: resumo.tomadorCnpj,
      valorServico: resumo.valorServico,
      discriminacao: resumo.discriminacao,
      dataEmissao: resumo.dataEmissao,
      xmlCompleto,
    },
  });

  try {
    const task = await criarTarefaNotaServico({
      chaveAcesso: resumo.chaveAcesso,
      numero: resumo.numero,
      prestadorNome: resumo.prestadorNome,
      prestadorCnpj: resumo.prestadorCnpj,
      empresaRazaoSocial: empresa.razaoSocial,
      empresaCnpj: empresa.cnpj,
      discriminacao: resumo.discriminacao,
      valorServico: Number(resumo.valorServico).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      }),
      dataEmissao: resumo.dataEmissao,
      xmlCompleto,
    });
    await prisma.notaServico.update({
      where: { id: nota.id },
      data: { clickupTaskId: task.id, clickupTaskUrl: task.url, clickupSyncError: null },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`Falha ao criar tarefa no ClickUp para NFS-e ${resumo.chaveAcesso}:`, err);
    await prisma.notaServico.update({ where: { id: nota.id }, data: { clickupSyncError: mensagem } });
  }

  return true;
}

export async function sincronizarNfseTodasEmpresas(): Promise<ResultadoSyncNfse[]> {
  const empresas = await prisma.empresa.findMany({ where: { active: true }, select: { id: true } });
  const resultados: ResultadoSyncNfse[] = [];
  for (const empresa of empresas) {
    resultados.push(await sincronizarNfseEmpresa(empresa.id));
  }
  return resultados;
}
