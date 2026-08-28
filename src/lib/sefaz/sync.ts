import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptBuffer, decryptString } from "@/lib/crypto";
import { lerCertificadoPfx } from "@/lib/sefaz/cert";
import { consultarDistribuicaoDFe } from "@/lib/sefaz/client";
import { manifestarCienciaOperacao } from "@/lib/sefaz/manifestacao";
import { parseProcNFe, parseResNFe, type NotaResumida } from "@/lib/sefaz/parse";
import { anexarXmlNaTarefa, criarTarefaNotaFiscal } from "@/lib/clickup";
import type { Ambiente } from "@/lib/types";

const MAX_PAGINAS_POR_SYNC = 20; // trava de segurança contra loop infinito por rodada

// cStat da SEFAZ para "Rejeição: Consumo Indevido" — retornado quando se
// consulta de novo menos de 1h depois de uma resposta sem documentos
// novos. Ver NT 2014.002 (Distribuição DFe).
const CSTAT_CONSUMO_INDEVIDO = "656";
const ESPERA_CONSUMO_INDEVIDO_MS = 60 * 60 * 1000; // 1 hora, conforme a própria mensagem da SEFAZ

function formatarEspera(ate: Date): string {
  const minutos = Math.max(1, Math.ceil((ate.getTime() - Date.now()) / 60000));
  return minutos >= 60
    ? `${Math.ceil(minutos / 60)}h`
    : `${minutos}min`;
}

export type ResultadoSync = {
  empresaId: string;
  notasNovas: number;
  erro?: string;
};

/** Sincroniza uma empresa: consulta a Distribuição DFe a partir do último
 * NSU conhecido, manifesta ciência das notas novas, guarda o XML completo
 * quando disponível, e cria/atualiza a tarefa correspondente no ClickUp. */
export async function sincronizarEmpresa(empresaId: string): Promise<ResultadoSync> {
  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

  // A SEFAZ pediu pra esperar (cStat 656) numa tentativa anterior — nem
  // tenta de novo, pra não piorar o bloqueio nem gastar chamada à toa.
  if (empresa.nfeBloqueadaAte && empresa.nfeBloqueadaAte > new Date()) {
    return {
      empresaId,
      notasNovas: 0,
      erro: `SEFAZ pediu pra aguardar — tente novamente em ${formatarEspera(empresa.nfeBloqueadaAte)}.`,
    };
  }

  const log = await prisma.syncLog.create({
    data: { empresaId, status: "EM_ANDAMENTO" },
  });

  let notasNovas = 0;

  try {
    if (!empresa.certPfxEnc || !empresa.certPasswordEnc) {
      throw new Error("Empresa sem certificado digital cadastrado.");
    }

    // Isolado do resto do try: qualquer exceção aqui vem de descriptografia
    // (node:crypto) ou parsing do .pfx (node-forge) — nunca deixamos o
    // texto original dessas exceções chegar ao banco/tela (lastSyncError é
    // exibido pra qualquer usuário logado). O detalhe completo só vai pro
    // log do servidor.
    let pfx: Buffer;
    let passphrase: string;
    let privateKeyPem: string;
    let certPem: string;
    try {
      pfx = decryptBuffer(empresa.certPfxEnc);
      passphrase = decryptString(empresa.certPasswordEnc);
      ({ privateKeyPem, certPem } = lerCertificadoPfx(pfx, passphrase));
    } catch (err) {
      console.error(`Falha ao carregar certificado da empresa ${empresaId}:`, err);
      throw new Error(
        "Não foi possível carregar o certificado digital cadastrado (senha incorreta, arquivo corrompido, ou a chave de cifragem do servidor mudou). Recadastre o certificado em Empresas."
      );
    }

    const ambiente = empresa.ambiente as Ambiente;

    let ultNsu = empresa.ultNsu;
    let maxNsu = empresa.maxNsu;
    let paginas = 0;
    let sequenciaEvento = 1;

    do {
      const resposta = await consultarDistribuicaoDFe({
        ambiente,
        uf: empresa.uf,
        cnpj: empresa.cnpj,
        ultNsu,
        pfx,
        passphrase,
      });

      // cStat 137 = nenhum documento localizado (fim da paginação);
      // 138 = documento(s) localizado(s).
      if (resposta.statusCode === CSTAT_CONSUMO_INDEVIDO) {
        const ate = new Date(Date.now() + ESPERA_CONSUMO_INDEVIDO_MS);
        await prisma.empresa.update({ where: { id: empresaId }, data: { nfeBloqueadaAte: ate } });
        throw new Error(
          `A SEFAZ pediu pra esperar 1h entre consultas sem notas novas (cStat 656). Isso é uma proteção da própria SEFAZ contra excesso de chamadas — não é um erro do app. Próxima tentativa liberada às ${ate.toLocaleTimeString("pt-BR")}.`
        );
      }
      if (resposta.statusCode !== "137" && resposta.statusCode !== "138") {
        throw new Error(`SEFAZ retornou cStat ${resposta.statusCode}: ${resposta.motivo}`);
      }

      for (const doc of resposta.documentos) {
        if (doc.schema.startsWith("resNFe")) {
          const resumo = parseResNFe(doc.xml);
          const criada = await upsertNotaResumo(empresaId, resumo, doc.xml);
          if (criada) notasNovas++;

          // Manifesta ciência da operação para liberar o XML completo numa
          // próxima consulta (a SEFAZ não libera o procNFe na mesma
          // resposta da manifestação).
          try {
            await manifestarCienciaOperacao({
              ambiente,
              uf: empresa.uf,
              cnpj: empresa.cnpj,
              chaveNFe: resumo.chaveAcesso,
              pfx,
              passphrase,
              privateKeyPem,
              certPem,
              sequencia: sequenciaEvento++,
            });
            await prisma.notaFiscal.update({
              where: { chaveAcesso: resumo.chaveAcesso },
              data: { manifestadaEm: new Date() },
            });
          } catch (err) {
            console.error(`Falha ao manifestar ciência de ${resumo.chaveAcesso}:`, err);
          }
        } else if (doc.schema.startsWith("procNFe")) {
          const completa = parseProcNFe(doc.xml);
          const criada = await upsertNotaCompleta(empresaId, completa, doc.xml);
          if (criada) notasNovas++;
        }
        // resEvento (cancelamentos, manifestações de terceiros etc.) não é
        // tratado nesta versão — só documentos de nota fiscal.
      }

      ultNsu = resposta.ultNSU;
      maxNsu = resposta.maxNSU;
      paginas++;
    } while (ultNsu !== maxNsu && paginas < MAX_PAGINAS_POR_SYNC);

    await prisma.empresa.update({
      where: { id: empresaId },
      data: { ultNsu, maxNsu, lastSyncAt: new Date(), lastSyncError: null, nfeBloqueadaAte: null },
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
      data: { lastSyncAt: new Date(), lastSyncError: mensagem },
    });
    await prisma.syncLog.update({
      where: { id: log.id },
      data: { status: "ERRO", finishedAt: new Date(), notasNovas, mensagem },
    });
    return { empresaId, notasNovas, erro: mensagem };
  }
}

/** Cria (ou ignora, se já existir) uma NotaFiscal a partir do resumo
 * (resNFe). Cria também a tarefa no ClickUp na primeira vez que a nota é
 * vista — não espera o XML completo para avisar que a nota chegou. */
async function upsertNotaResumo(
  empresaId: string,
  resumo: NotaResumida,
  xmlResumo: string
): Promise<boolean> {
  const existente = await prisma.notaFiscal.findUnique({
    where: { chaveAcesso: resumo.chaveAcesso },
  });
  if (existente) return false;

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

  const nota = await prisma.notaFiscal.create({
    data: {
      empresaId,
      chaveAcesso: resumo.chaveAcesso,
      nsu: "",
      numero: resumo.numero,
      serie: resumo.serie,
      emitenteCnpj: resumo.emitenteCnpj,
      emitenteNome: resumo.emitenteNome,
      valorTotal: resumo.valorTotal,
      dataEmissao: resumo.dataEmissao,
      status: "RESUMO",
      xmlResumo,
    },
  });

  await criarTarefaClickUpParaNota(nota.id, resumo, empresa.razaoSocial, empresa.cnpj, null);
  return true;
}

/** Cria ou completa uma NotaFiscal a partir do XML completo (procNFe). Se a
 * tarefa do ClickUp já existir (criada a partir do resumo), só anexa o XML;
 * senão cria a tarefa agora. */
async function upsertNotaCompleta(
  empresaId: string,
  completa: NotaResumida,
  xmlCompleto: string
): Promise<boolean> {
  const existente = await prisma.notaFiscal.findUnique({
    where: { chaveAcesso: completa.chaveAcesso },
  });

  const empresa = await prisma.empresa.findUniqueOrThrow({ where: { id: empresaId } });

  if (!existente) {
    const nota = await prisma.notaFiscal.create({
      data: {
        empresaId,
        chaveAcesso: completa.chaveAcesso,
        nsu: "",
        numero: completa.numero,
        serie: completa.serie,
        emitenteCnpj: completa.emitenteCnpj,
        emitenteNome: completa.emitenteNome,
        valorTotal: completa.valorTotal,
        dataEmissao: completa.dataEmissao,
        status: "COMPLETA",
        xmlCompleto,
      },
    });
    await criarTarefaClickUpParaNota(
      nota.id,
      completa,
      empresa.razaoSocial,
      empresa.cnpj,
      xmlCompleto
    );
    return true;
  }

  await prisma.notaFiscal.update({
    where: { id: existente.id },
    data: { status: "COMPLETA", xmlCompleto },
  });

  if (existente.clickupTaskId) {
    await anexarXmlNaTarefa(existente.clickupTaskId, completa.chaveAcesso, xmlCompleto).catch(
      (err) => console.error(`Falha ao anexar XML completo na tarefa existente:`, err)
    );
  } else {
    await criarTarefaClickUpParaNota(
      existente.id,
      completa,
      empresa.razaoSocial,
      empresa.cnpj,
      xmlCompleto
    );
  }
  return false;
}

async function criarTarefaClickUpParaNota(
  notaId: string,
  resumo: NotaResumida,
  empresaRazaoSocial: string,
  empresaCnpj: string,
  xmlCompleto: string | null
) {
  try {
    const task = await criarTarefaNotaFiscal({
      chaveAcesso: resumo.chaveAcesso,
      numero: resumo.numero,
      serie: resumo.serie,
      emitenteNome: resumo.emitenteNome,
      emitenteCnpj: resumo.emitenteCnpj,
      empresaRazaoSocial,
      empresaCnpj,
      valorTotal: Number(resumo.valorTotal).toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
      }),
      valorTotalNumerico: Number(resumo.valorTotal),
      dataEmissao: resumo.dataEmissao,
      statusColeta: xmlCompleto ? "COMPLETA" : "RESUMO",
      xmlCompleto,
    });
    await prisma.notaFiscal.update({
      where: { id: notaId },
      data: { clickupTaskId: task.id, clickupTaskUrl: task.url, clickupSyncError: null },
    });
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : String(err);
    console.error(`Falha ao criar tarefa no ClickUp para nota ${resumo.chaveAcesso}:`, err);
    await prisma.notaFiscal.update({
      where: { id: notaId },
      data: { clickupSyncError: mensagem },
    });
  }
}

/** Sincroniza todas as empresas ativas — usado pelo cron e pelo botão
 * "Sincronizar agora". */
export async function sincronizarTodasEmpresas(): Promise<ResultadoSync[]> {
  const empresas = await prisma.empresa.findMany({
    where: { active: true },
    select: { id: true },
  });

  const resultados: ResultadoSync[] = [];
  for (const empresa of empresas) {
    resultados.push(await sincronizarEmpresa(empresa.id));
  }
  return resultados;
}
