import "server-only";
import { CAMPOS_CLICKUP } from "@/lib/clickup-fields";

// Integração com a API v2 do ClickUp — cria uma tarefa por nota fiscal
// coletada na lista "App Coleta NF" (espaço CONTÁBIL E FISCAL), com os
// campos customizados do catálogo em src/lib/clickup-fields.ts.
//
// Variáveis de ambiente necessárias:
// - CLICKUP_API_TOKEN: token de API pessoal ou de app do ClickUp
//   (gerado em Configurações → Apps, na conta do ClickUp).
// - CLICKUP_LIST_ID: id da lista "App Coleta NF" (901716420520 no workspace
//   atual — confirme se mudar de workspace).
//
// Os campos customizados precisam existir na lista antes de serem
// preenchidos — rode `npm run clickup:setup-fields` uma vez (veja README).
// Preenchimento é best-effort: um campo que não existe (ainda não criado,
// renomeado, ou catálogo desatualizado) é simplesmente ignorado — nunca
// impede a tarefa de ser criada.

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

type ClickUpFieldOption = { id: string; name: string };
type ClickUpFieldDef = {
  id: string;
  name: string;
  type: string;
  type_config?: { options?: ClickUpFieldOption[] };
};

// Cache em memória dos campos da lista — evita um GET extra por nota numa
// mesma execução (uma sincronização processa várias notas em sequência).
// TTL curto porque o processo serverless pode ficar "quente" entre
// invocações do cron.
let fieldsCache: { fetchedAt: number; fields: ClickUpFieldDef[] } | null = null;
const FIELDS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getListFields(): Promise<ClickUpFieldDef[]> {
  if (fieldsCache && Date.now() - fieldsCache.fetchedAt < FIELDS_CACHE_TTL_MS) {
    return fieldsCache.fields;
  }
  const res = await fetch(`${CLICKUP_API_BASE}/list/${listId()}/field`, {
    headers: { Authorization: apiToken() },
  });
  if (!res.ok) {
    console.error(`Falha ao buscar campos customizados da lista (${res.status})`);
    return fieldsCache?.fields ?? [];
  }
  const data = (await res.json()) as { fields: ClickUpFieldDef[] };
  fieldsCache = { fetchedAt: Date.now(), fields: data.fields };
  return data.fields;
}

function findField(fields: ClickUpFieldDef[], name: string): ClickUpFieldDef | undefined {
  const target = name.trim().toLowerCase();
  return fields.find((f) => f.name.trim().toLowerCase() === target);
}

/** Monta o array `custom_fields` (id + value) pro payload de criação da
 * tarefa a partir de um mapa `{ nomeDoCampo: valorBruto }`. Campos "drop_down"
 * recebem o rótulo da opção (ex: "NF-e") e são resolvidos pro UUID da opção;
 * campos "date" recebem um `Date` e são convertidos pra epoch ms; o resto
 * (texto/moeda) passa direto. Um campo ausente na lista, ou uma opção de
 * dropdown sem correspondência, é simplesmente omitido do resultado. */
async function montarCustomFields(
  valores: Record<string, string | number | Date | null | undefined>
): Promise<{ id: string; value: string | number }[]> {
  const fields = await getListFields();
  const resultado: { id: string; value: string | number }[] = [];

  for (const [nome, valor] of Object.entries(valores)) {
    if (valor === null || valor === undefined || valor === "") continue;
    const field = findField(fields, nome);
    if (!field) continue; // campo ainda não criado na lista — ignora

    if (field.type === "drop_down") {
      const option = field.type_config?.options?.find(
        (o) => o.name.trim().toLowerCase() === String(valor).trim().toLowerCase()
      );
      if (option) resultado.push({ id: field.id, value: option.id });
      continue;
    }

    if (field.type === "date") {
      const date = valor instanceof Date ? valor : new Date(String(valor));
      if (!Number.isNaN(date.getTime())) {
        resultado.push({ id: field.id, value: date.getTime() });
      }
      continue;
    }

    resultado.push({ id: field.id, value: String(valor) });
  }

  return resultado;
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
  valorTotalNumerico: number;
  dataEmissao: Date;
  statusColeta: "RESUMO" | "COMPLETA";
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
  valorServicoNumerico: number;
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
  custom_fields: { id: string; value: string | number }[];
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
      custom_fields: params.custom_fields,
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

  const custom_fields = await montarCustomFields({
    "Tipo de Documento": "NF-e",
    "CNPJ Emitente/Prestador": nota.emitenteCnpj,
    "Razão Social Emitente/Prestador": nota.emitenteNome,
    "CNPJ da Empresa (destinatário/tomador)": nota.empresaCnpj,
    "Chave de Acesso": nota.chaveAcesso,
    "Número do Documento": `${nota.numero}/${nota.serie}`,
    Valor: nota.valorTotalNumerico,
    "Data de Emissão": nota.dataEmissao,
    "Status de Coleta": nota.statusColeta === "COMPLETA" ? "XML completo" : "Resumo",
  });

  return criarTarefa({
    name,
    markdown_description,
    chaveAcesso: nota.chaveAcesso,
    custom_fields,
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

  const custom_fields = await montarCustomFields({
    "Tipo de Documento": "NFS-e",
    "CNPJ Emitente/Prestador": nota.prestadorCnpj,
    "Razão Social Emitente/Prestador": nota.prestadorNome,
    "CNPJ da Empresa (destinatário/tomador)": nota.empresaCnpj,
    "Chave de Acesso": nota.chaveAcesso,
    "Número do Documento": nota.numero,
    Valor: nota.valorServicoNumerico,
    "Data de Emissão": nota.dataEmissao,
    "Status de Coleta": "NFS-e",
  });

  return criarTarefa({
    name,
    markdown_description,
    chaveAcesso: nota.chaveAcesso,
    custom_fields,
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

/** Atualiza o campo "Status de Coleta" de uma tarefa já existente para
 * "XML completo" — usado junto com anexarXmlNaTarefa quando o procNFe chega
 * depois da tarefa já ter sido criada a partir do resumo (resNFe). Sem
 * isso, a tarefa fica com o XML completo anexado mas o campo continua
 * mostrando "Resumo" pra sempre. */
export async function marcarStatusColetaCompleta(taskId: string): Promise<void> {
  const fields = await getListFields();
  const field = findField(fields, "Status de Coleta");
  if (!field) return; // campo ainda não criado na lista — ignora

  const option = field.type_config?.options?.find(
    (o) => o.name.trim().toLowerCase() === "xml completo"
  );
  if (!option) return;

  const res = await fetch(`${CLICKUP_API_BASE}/task/${taskId}/field/${field.id}`, {
    method: "POST",
    headers: {
      Authorization: apiToken(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: option.id }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Falha ao atualizar Status de Coleta (${res.status}): ${body}`);
  }
}

// Mantido pro script de setup e uso futuro — reexportado por conveniência.
export { CAMPOS_CLICKUP };
