import "server-only";
import https from "node:https";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { UF_CODES } from "@/lib/types";

// Manifestação do Destinatário — evento "Ciência da Operação" (tpEvento
// 210200). É pré-requisito da SEFAZ para liberar o XML completo (procNFe)
// de uma nota fiscal via Distribuição DFe: antes disso só o resumo (resNFe)
// fica disponível.
//
// Enviado ao webservice nacional de Recepção de Evento. Assim como o
// cliente de distribuição (client.ts), esta implementação segue a
// especificação oficial mas não foi validada contra o ambiente real da
// SEFAZ nesta sessão — revise com um certificado de teste antes de operar
// em produção.

const ENDPOINTS = {
  PRODUCAO: "https://www1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  HOMOLOGACAO:
    "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
} as const;

const SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

const TP_EVENTO_CIENCIA = "210200";
const DESC_EVENTO_CIENCIA = "Ciencia da Operacao";
const COD_ORGAO_AN = "91"; // Ambiente Nacional

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Data/hora no formato exigido pelo schema da NFe: AAAA-MM-DDTHH:mm:ssTZD */
function dataHoraEvento(): string {
  const now = new Date();
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const tz = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}` +
    `T${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}${tz}`
  );
}

function montarEventoXmlSemAssinatura(params: {
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  cnpj: string;
  chaveNFe: string;
  sequencia: number;
}): { xml: string; id: string } {
  const tpAmb = params.ambiente === "PRODUCAO" ? 1 : 2;
  const id = `ID${TP_EVENTO_CIENCIA}${params.chaveNFe}${String(params.sequencia).padStart(
    2,
    "0"
  )}`;

  const xml =
    `<eventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
    `<infEvento Id="${id}">` +
    `<cOrgao>${COD_ORGAO_AN}</cOrgao>` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<CNPJ>${params.cnpj}</CNPJ>` +
    `<chNFe>${params.chaveNFe}</chNFe>` +
    `<dhEvento>${dataHoraEvento()}</dhEvento>` +
    `<tpEvento>${TP_EVENTO_CIENCIA}</tpEvento>` +
    `<nSeqEvento>${params.sequencia}</nSeqEvento>` +
    `<verEvento>1.00</verEvento>` +
    `<detEvento versao="1.00">` +
    `<descEvento>${DESC_EVENTO_CIENCIA}</descEvento>` +
    `</detEvento>` +
    `</infEvento>` +
    `</eventoNFe>`;

  return { xml, id };
}

function assinarEvento(xml: string, privateKeyPem: string, certPem: string): string {
  const certLines = certPem
    .replace(/-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----/, "")
    .replace(/\s+/g, "");

  const sig = new SignedXml({
    privateKey: privateKeyPem,
    publicCert: certPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    getKeyInfoContent: () =>
      `<X509Data><X509Certificate>${certLines}</X509Certificate></X509Data>`,
  });

  sig.addReference({
    xpath: "//*[local-name(.)='infEvento']",
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    transforms: [
      "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
      "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    ],
  });

  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infEvento']", action: "after" },
  });

  return sig.getSignedXml();
}

function montarEnvelope(eventoAssinado: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>
        <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
          <idLote>1</idLote>
          ${eventoAssinado}
        </envEvento>
      </nfeDadosMsg>
    </nfeRecepcaoEvento>
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
          "Content-Type":
            'application/soap+xml; charset=utf-8; action="' + SOAP_ACTION + '"',
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
    req.on("timeout", () => req.destroy(new Error("Tempo esgotado ao manifestar evento.")));
    req.on("error", reject);
    req.write(params.envelope);
    req.end();
  });
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Ver o mesmo comentário em src/lib/sefaz/client.ts — evita a conversão
  // automática de texto numérico pra Number do JS, que corrompe campos
  // longos (protocolo, NSU) e CNPJ com zero à esquerda.
  parseTagValue: false,
});

export type ResultadoManifestacao = {
  statusCode: string;
  motivo: string;
  sucesso: boolean;
};

/** Envia o evento de Ciência da Operação para uma nota fiscal, autenticado
 * com o certificado A1 da empresa destinatária. */
export async function manifestarCienciaOperacao(params: {
  ambiente: "PRODUCAO" | "HOMOLOGACAO";
  uf: string;
  cnpj: string;
  chaveNFe: string;
  pfx: Buffer;
  passphrase: string;
  privateKeyPem: string;
  certPem: string;
  sequencia?: number;
}): Promise<ResultadoManifestacao> {
  if (!UF_CODES[params.uf]) {
    throw new Error(`UF desconhecida: ${params.uf}`);
  }

  const { xml } = montarEventoXmlSemAssinatura({
    ambiente: params.ambiente,
    cnpj: params.cnpj,
    chaveNFe: params.chaveNFe,
    sequencia: params.sequencia ?? 1,
  });
  const eventoAssinado = assinarEvento(xml, params.privateKeyPem, params.certPem);
  const envelope = montarEnvelope(eventoAssinado);

  const responseXml = await postSoap({
    url: ENDPOINTS[params.ambiente],
    envelope,
    pfx: params.pfx,
    passphrase: params.passphrase,
  });

  const parsed = parser.parse(responseXml);
  const retorno =
    parsed?.Envelope?.Body?.nfeRecepcaoEventoResponse?.nfeRecepcaoEventoResult
      ?.retEnvEvento;
  const retEvento = retorno?.retEvento?.infEvento;

  const statusCode = String(retEvento?.cStat ?? retorno?.cStat ?? "");
  const motivo = String(retEvento?.xMotivo ?? retorno?.xMotivo ?? responseXml.slice(0, 300));

  // cStat 135/136 = evento registrado e vinculado (ou não vinculado) à NF-e —
  // ambos indicam que a manifestação foi aceita.
  const sucesso = statusCode === "135" || statusCode === "136";

  return { statusCode, motivo, sucesso };
}
