import "server-only";
import https from "node:https";
import zlib from "node:zlib";

// Cliente do Ambiente de Dados Nacional (ADN) do Sistema Nacional NFS-e —
// o "Distribuição DFe" das notas de serviço, mantido pela Receita Federal/
// ENCAT (Convênio NFS-e, Ajuste SINIEF 00/2022). Cobre só os municípios que
// já aderiram ao padrão nacional — veja o README para o estado da adoção.
//
// ⚠️ MAIS INCERTO QUE O CLIENTE DE NF-E (src/lib/sefaz/client.ts): o Sistema
// Nacional NFS-e é recente e ainda em evolução, e a URL/formato exatos do
// endpoint de distribuição abaixo **não foram confirmados contra o manual
// de integração oficial vigente** (não estava disponível nesta sessão).
// A implementação segue o padrão publicamente descrito para o ADN — REST/
// JSON, autenticado com o mesmo certificado A1 (mTLS), paginação por NSU
// (o mesmo conceito da Distribuição DFe da NF-e) — mas TRATE A URL E O
// FORMATO DE RESPOSTA COMO PLACEHOLDER até validar com o manual técnico
// atual em https://www.gov.br/nfse (ou com o provedor do seu município).
// Ajuste `NFSE_ADN_BASE_URL` no `.env` sem precisar mexer no código.

const DEFAULT_BASE_URL = "https://adn.nfse.gov.br";

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
 * formato exato de compactação do payload não foi confirmado). */
function decodeDocPayload(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  try {
    return zlib.gunzipSync(buf).toString("utf8");
  } catch {
    return buf.toString("utf8");
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
  const url = `${baseUrl()}/contribuinte/dfe?cnpj=${params.cnpj}&nsu=${params.ultNsu}`;

  const { status, body } = await getRest({ url, pfx: params.pfx, passphrase: params.passphrase });

  if (status === 404) {
    // Sem documentos novos — mesmo comportamento de "nenhum documento
    // localizado" da NF-e.
    return { ultNSU: params.ultNsu, maxNSU: params.ultNsu, documentos: [] };
  }
  if (status >= 400) {
    throw new Error(`ADN NFS-e respondeu ${status}: ${body.slice(0, 500)}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(
      `Resposta do ADN NFS-e não é JSON — endpoint/formato provavelmente desatualizado (veja o aviso em src/lib/nfse/client.ts): ${body.slice(0, 500)}`
    );
  }

  const obj = parsed as {
    ultNSU?: string;
    maxNSU?: string;
    lote?: { nsu?: string; docNFSe?: string }[];
  };

  const documentos: DocumentoNfse[] = (obj.lote ?? [])
    .filter((item) => item.docNFSe)
    .map((item) => ({
      nsu: String(item.nsu ?? ""),
      xml: decodeDocPayload(item.docNFSe as string),
    }));

  return {
    ultNSU: String(obj.ultNSU ?? params.ultNsu),
    maxNSU: String(obj.maxNSU ?? obj.ultNSU ?? params.ultNsu),
    documentos,
  };
}
