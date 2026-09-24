import "server-only";
import https from "node:https";
import zlib from "node:zlib";

// Cliente do Ambiente de Dados Nacional (ADN) do Sistema Nacional NFS-e —
// o "Distribuição de DFe" das notas de serviço, mantido pela Receita
// Federal/CGNFS (Convênio NFS-e, Ajuste SINIEF 00/2022). Cobre só os
// municípios que já aderiram ao padrão nacional — veja o README para o
// estado da adoção.
//
// ⚠️ Endpoint corrigido em 2026-09 depois de uma sincronização real que
// nunca capturou nenhuma NFS-e: a URL usada antes (`/contribuinte/dfe?
// cnpj=...&nsu=...`) não existe na API — qualquer chamada batia 404, e o
// código tratava 404 como "nenhum documento novo" (mesmo comportamento da
// Distribuição DFe da NF-e), mascarando o erro como sucesso silencioso.
//
// A URL corrigida (`/contribuintes/DFe/{NSU}?cnpjConsulta=...`, NSU no
// path e CNPJ em query string) **já foi confirmada contra uma resposta
// real de produção**: o ADN passou a retornar `LoteDFe` com documentos de
// verdade (`NSU`, `ChaveAcesso`, `TipoDocumento: "NFSE"`, `ArquivoXml`).
// O único ponto que a primeira correção errou (também descoberto contra
// produção): `StatusProcessamento` vem como **string** (ex.:
// "DOCUMENTOS_LOCALIZADOS"), não como os códigos numéricos cStat 137/138
// da Distribuição DFe da NF-e que relatos de terceiros sugeriam. Por isso
// o parsing abaixo não depende do valor exato de `StatusProcessamento` —
// usa a presença de `LoteDFe` (lista) e a ausência de `Erros` como sinal
// de resposta válida, já que o vocabulário completo de status (em especial
// o de "sem documentos novos") continua não documentado publicamente (o
// Manual dos Contribuintes oficial não descreve o schema da resposta, e o
// Swagger completo fica atrás de autenticação por certificado).
//
// Qualquer resposta em formato realmente inesperado (sem `LoteDFe` como
// lista, ou com `Erros` preenchido) derruba a sincronização com um erro
// explícito em vez de virar "0 notas novas" silencioso — é assim que se
// descobriu o bug da URL original. Ajuste `NFSE_ADN_BASE_URL` no `.env`
// sem precisar mexer no código.

const DEFAULT_BASE_URL = "https://adn.nfse.gov.br";

// Tamanho de lote documentado — um lote cheio é o único sinal disponível de
// que provavelmente há mais documentos a buscar (a resposta não expõe um
// "maxNSU" explícito como a Distribuição DFe da NF-e).
const DOCUMENTOS_POR_LOTE = 50;

function baseUrl(): string {
  return process.env.NFSE_ADN_BASE_URL || DEFAULT_BASE_URL;
}

export type DocumentoNfse = {
  nsu: string;
  xml: string; // XML da NFS-e já descompactado
};

export type RespostaDistribuicaoNfse = {
  ultNSU: string;
  maxNSU: string;
  documentos: DocumentoNfse[];
};

function getRest(params: {
  url: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(params.url);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "GET",
        pfx: params.pfx,
        passphrase: params.passphrase,
        headers: { Accept: "application/json" },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado ao consultar o ADN NFS-e.")));
    req.on("error", reject);
    req.end();
  });
}

/** Tenta descompactar como gzip; se não for gzip, assume texto puro (o
 * relato de integração citado no topo do arquivo descreve o payload como
 * gzip+base64, mas mantemos o fallback por segurança). */
function decodeDocPayload(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  try {
    return zlib.gunzipSync(buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
  }
}

function maiorNsu(atual: string, candidato: string): string {
  if (!candidato) return atual;
  try {
    return BigInt(candidato) > BigInt(atual || "0") ? candidato : atual;
  } catch {
    return atual; // NSU em formato inesperado — ignora em vez de derrubar a sincronização inteira
  }
}

/** Consulta a distribuição de NFS-e a partir de um NSU (documentos com
 * NSU > ultNsu). Assim como a NF-e, o chamador deve repetir a chamada em
 * loop até ultNSU === maxNSU. */
export async function consultarDistribuicaoNfse(params: {
  cnpj: string;
  ultNsu: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<RespostaDistribuicaoNfse> {
  const nsuConsulta = params.ultNsu || "0";
  const url = `${baseUrl()}/contribuintes/DFe/${encodeURIComponent(nsuConsulta)}?cnpjConsulta=${encodeURIComponent(params.cnpj)}`;

  const { status, body } = await getRest({ url, pfx: params.pfx, passphrase: params.passphrase });

  if (status >= 400) {
    throw new Error(`ADN NFS-e respondeu ${status} em ${url}: ${body.slice(0, 500)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `Resposta do ADN NFS-e não é JSON (HTTP ${status}) — endpoint/formato provavelmente desatualizado (veja o aviso no topo de src/lib/nfse/client.ts): ${body.slice(0, 500)}`
    );
  }

  const obj = parsed as {
    StatusProcessamento?: string | number;
    LoteDFe?: { NSU?: string; ChaveAcesso?: string; ArquivoXml?: string; TipoDocumento?: string }[];
    Erros?: unknown[];
  };

  // `StatusProcessamento` é uma string (ex.: "DOCUMENTOS_LOCALIZADOS"), não
  // o código numérico cStat 137/138 da Distribuição DFe da NF-e como se
  // supôs antes de validar contra uma resposta real — o vocabulário
  // completo de valores (em especial o de "sem documentos novos") segue
  // não documentado publicamente. Por isso não filtramos por valor exato:
  // confiamos na estrutura (`LoteDFe` como lista, sem `Erros`) em vez do
  // texto do status.
  if (!Array.isArray(obj.LoteDFe)) {
    throw new Error(
      `Resposta do ADN NFS-e em formato inesperado (LoteDFe ausente ou não é lista; StatusProcessamento=${JSON.stringify(
        obj.StatusProcessamento
      )}) — endpoint/formato provavelmente desatualizado (veja o aviso no topo de src/lib/nfse/client.ts): ${body.slice(0, 500)}`
    );
  }

  if (Array.isArray(obj.Erros) && obj.Erros.length > 0) {
    throw new Error(
      `ADN NFS-e retornou Erros (StatusProcessamento=${JSON.stringify(obj.StatusProcessamento)}): ${JSON.stringify(obj.Erros)}`
    );
  }

  const lote = obj.LoteDFe;
  const documentos: DocumentoNfse[] = lote
    .filter((item) => item.ArquivoXml)
    .map((item) => ({
      nsu: String(item.NSU ?? ""),
      xml: decodeDocPayload(item.ArquivoXml as string),
    }));

  const ultNSU = documentos.reduce((max, doc) => maiorNsu(max, doc.nsu), nsuConsulta);
  const podeTerMais = lote.length >= DOCUMENTOS_POR_LOTE;

  return {
    ultNSU,
    // Sem um "maxNSU" explícito na resposta, um lote cheio é tratado como
    // "provavelmente há mais" — incrementa pra forçar outra iteração do
    // loop de paginação em sincronizarNfseEmpresa (src/lib/nfse/sync.ts).
    maxNSU: podeTerMais ? String(BigInt(ultNSU || "0") + BigInt(1)) : ultNSU,
    documentos,
  };
}
