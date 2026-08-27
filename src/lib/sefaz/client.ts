import "server-only";
import https from "node:https";
import zlib from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { UF_CODES } from "@/lib/types";

// Cliente do webservice NFeDistribuicaoDFe da SEFAZ (Ambiente Nacional —
// endpoint único para o país todo, independente da UF do CNPJ consultado).
// Referência: Nota Técnica 2014.002 (Distribuição de DF-e).
//
// IMPORTANTE: este módulo não pôde ser testado contra o webservice real da
// SEFAZ nesta sessão (exige certificado A1 válido de um CNPJ real). A
// estrutura do envelope SOAP e do parsing segue a especificação oficial,
// mas vale validar com um certificado de teste antes de operar em produção
// — veja o README, seção "Validando a integração com a SEFAZ".

const ENDPOINTS = {
  PRODUCAO: "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
  HOMOLOGACAO:
    "https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
} as const;

const SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse";

export type DocumentoDistribuicao = {
  nsu: string;
  schema: string; // "resNFe_v1.01.xsd" | "resEvento_v1.01.xsd" | "procNFe_v1.00.xsd" | ...
  xml: string; // XML já descompactado (gunzip do docZip em base64)
};

export type RespostaDistribuicaoDFe = {
  statusCode: string;
  motivo: string;
  ultNSU: string;
  maxNSU: string;
  documentos: DocumentoDistribuicao[];
};

function montarEnvelope(params: {
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  uf: string;
  cnpj: string;
  ultNsu: string;
}): string {
  const tpAmb = params.ambiente === "PRODUCAO" ? 1 : 2;
  const cUFAutor = UF_CODES[params.uf];
  if (!cUFAutor) {
    throw new Error(`UF desconhecida: ${params.uf}`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
          <tpAmb>${tpAmb}</tpAmb>
          <cUFAutor>${cUFAutor}</cUFAutor>
          <CNPJ>${params.cnpj}</CNPJ>
          <distNSU>
            <ultNSU>${params.ultNsu.padStart(15, "0")}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

function postSoap(params: {
  url: string;
  envelope: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = new URL(params.url);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        pfx: params.pfx,
        passphrase: params.passphrase,
        headers: {
          "Content-Type": "application/soap+xml; charset=utf-8; action=\"" + SOAP_ACTION + "\"",
          "Content-Length": Buffer.byteLength(params.envelope),
        },
        timeout: 30_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 0) >= 400) {
            reject(new Error(`SEFAZ respondeu ${res.statusCode}: ${body.slice(0, 500)}`));
            return;
          }
          resolve(body);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado ao consultar a SEFAZ.")));
    req.on("error", reject);
    req.write(params.envelope);
    req.end();
  });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

/** Consulta o webservice de Distribuição DFe a partir de um NSU (retorna
 * documentos com NSU > ultNsu informado). O chamador é responsável por
 * repetir a chamada em loop até ultNSU === maxNSU (paginação). */
export async function consultarDistribuicaoDFe(params: {
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  uf: string;
  cnpj: string;
  ultNsu: string;
  pfx: Buffer;
  passphrase: string;
}): Promise<RespostaDistribuicaoDFe> {
  const envelope = montarEnvelope(params);
  const url = ENDPOINTS[params.ambiente];
  const responseXml = await postSoap({
    url,
    envelope,
    pfx: params.pfx,
    passphrase: params.passphrase,
  });

  const parsed = parser.parse(responseXml);
  const body = parsed?.Envelope?.Body;
  const retorno = body?.nfeDistDFeInteresseResponse?.nfeDistDFeInteresseResult?.retDistDFeInt;
  if (!retorno) {
    throw new Error(`Resposta da SEFAZ em formato inesperado: ${responseXml.slice(0, 800)}`);
  }

  const statusCode = String(retorno.cStat ?? "");
  const motivo = String(retorno.xMotivo ?? "");
  const ultNSU = String(retorno.ultNSU ?? params.ultNsu);
  const maxNSU = String(retorno.maxNSU ?? ultNSU);

  const documentos: DocumentoDistribuicao[] = [];
  const loteRaw = retorno?.loteDistDFeInt?.docZip;
  const lote = Array.isArray(loteRaw) ? loteRaw : loteRaw ? [loteRaw] : [];

  for (const doc of lote) {
    const base64 = typeof doc === "string" ? doc : doc["#text"];
    const schema = typeof doc === "object" ? String(doc["@_schema"] ?? "") : "";
    const nsu = typeof doc === "object" ? String(doc["@_NSU"] ?? "") : "";
    if (!base64) continue;
    const gzipped = Buffer.from(base64, "base64");
    const xml = zlib.gunzipSync(gzipped).toString("utf8");
    documentos.push({ nsu, schema, xml });
  }

  return { statusCode, motivo, ultNSU, maxNSU, documentos };
}
