import "server-only";

// Integração com a API v2 do ClickUp — cria uma tarefa por nota fiscal
// coletada na lista "App Coleta NF" (espaço CONTÁBIL E FISCAL).
//
// Variáveis de ambiente necessárias:
// - CLICKUP_API_TOKEN: token de API pessoal ou de app do ClickUp
//   (gerado em Configurações → Apps, na conta do ClickUp).
// - CLICKUP_LIST_ID: id da lista "App Coleta NF" (901716420520 no workspace
//   atual — confirme se mudar de workspace).

const CLICKUP_API_BASE = "https://api.clickup.com/api/v2";

function apiToken(): string {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    throw new Error("CLICKUP_API_TOKEN não configurado no ambiente.");
  }
  return token;
}

function listId(): string {
  const id = process.env.CLICKUP_LIST_ID;
  if (!id) {
    throw new Error("CLICKUP_LIST_ID não configurado no ambiente.");
  }
  return id;
}

export type NotaParaClickUp = {
  chaveAcesso: string;
  numero: string;
  serie: string;
  emitenteNome: string;
  emitenteCnpj: string;
  empresaRazaoSocial: string;
  empresaCnpj: string;
  valorTotal: string; // já formatado, ex: "1.234,56"
  dataEmissao: Date;
  xmlCompleto?: string | null;
};

export type NotaServicoParaClickUp = {
  chaveAcesso: string;
  numero: string;
  prestadorNome: string;
  prestadorCnpj: string;
  empresaRazaoSocial: string;
  empresaCnpj: string;
  discriminacao: string | null;
  valorServico: string; // já formatado, ex: "1.234,56"
  dataEmissao: Date;
  xmlCompleto?: string | null;
};

type ClickUpTaskResponse = {
  id: string;
  url: string;
};

async function criarTarefa(params: {
  name: string;
  markdown_description: string;
  chaveAcesso: string;
  xmlCompleto?: string | null;
}): Promise<ClickUpTaskResponse> {
  const res = await fetch(`${CLICKUP_API_BASE}/list/${listId()}/task`, {
    method: "POST",
    headers: {
      Authorization: apiToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: params.name,
      markdown_description: params.markdown_description,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao criar tarefa no ClickUp (${res.status}): ${body}`);
  }

  const data = (await res.json()) as ClickUpTaskResponse;

  if (params.xmlCompleto) {
    await anexarXmlNaTarefa(data.id, params.chaveAcesso, params.xmlCompleto).catch((err) => {
      // Não falha a criação da tarefa por causa do anexo — só registra.
      console.error(`Falha ao anexar XML na tarefa ${data.id}:`, err);
    });
  }

  return data;
}

/** Cria uma tarefa na lista "App Coleta NF" para uma nota fiscal (NF-e)
 * recém coletada. Retorna o id e a url da tarefa criada. */
export async function criarTarefaNotaFiscal(
  nota: NotaParaClickUp
): Promise<ClickUpTaskResponse> {
  const dataFmt = nota.dataEmissao.toLocaleDateString("pt-BR");
  const name = `NF ${nota.numero}/${nota.serie} — ${nota.emitenteNome} → ${nota.empresaRazaoSocial}`;

  const markdown_description = [
    `**Chave de acesso:** \`${nota.chaveAcesso}\``,
    `**Emitente:** ${nota.emitenteNome} (${nota.emitenteCnpj})`,
    `**Destinatário (CNPJ cadastrado):** ${nota.empresaRazaoSocial} (${nota.empresaCnpj})`,
    `**Número/Série:** ${nota.numero}/${nota.serie}`,
    `**Data de emissão:** ${dataFmt}`,
    `**Valor total:** R$ ${nota.valorTotal}`,
    ``,
    `_Coletada automaticamente pelo Buscador NF CRM._`,
  ].join("\n");

  return criarTarefa({
    name,
    markdown_description,
    chaveAcesso: nota.chaveAcesso,
    xmlCompleto: nota.xmlCompleto,
  });
}

/** Cria uma tarefa na lista "App Coleta NF" para uma NFS-e recém coletada. */
export async function criarTarefaNotaServico(
  nota: NotaServicoParaClickUp
): Promise<ClickUpTaskResponse> {
  const dataFmt = nota.dataEmissao.toLocaleDateString("pt-BR");
  const name = `NFS-e ${nota.numero} — ${nota.prestadorNome} → ${nota.empresaRazaoSocial}`;

  const markdown_description = [
    `**Chave de acesso:** \`${nota.chaveAcesso}\``,
    `**Prestador:** ${nota.prestadorNome} (${nota.prestadorCnpj})`,
    `**Tomador (CNPJ cadastrado):** ${nota.empresaRazaoSocial} (${nota.empresaCnpj})`,
    `**Número:** ${nota.numero}`,
    `**Data de emissão:** ${dataFmt}`,
    `**Valor do serviço:** R$ ${nota.valorServico}`,
    ...(nota.discriminacao ? [`**Discriminação:** ${nota.discriminacao}`] : []),
    ``,
    `_Coletada automaticamente pelo Buscador NF CRM (NFS-e — cobertura parcial, veja README)._`,
  ].join("\n");

  return criarTarefa({
    name,
    markdown_description,
    chaveAcesso: nota.chaveAcesso,
    xmlCompleto: nota.xmlCompleto,
  });
}

/** Anexa o XML completo da NF-e a uma tarefa já existente — usado quando o
 * procNFe só fica disponível depois da tarefa já ter sido criada a partir
 * do resumo (resNFe). */
export async function anexarXmlNaTarefa(
  taskId: string,
  chaveAcesso: string,
  xmlCompleto: string
): Promise<void> {
  const form = new FormData();
  const blob = new Blob([xmlCompleto], { type: "application/xml" });
  form.append("attachment", blob, `${chaveAcesso}.xml`);

  const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}/attachment`, {
    method: "POST",
    headers: { Authorization: apiToken() },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao anexar arquivo (${res.status}): ${body}`);
  }
}
