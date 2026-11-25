import "server-only";
import https from "node:https";
import { SignedXml } from "xml-crypto";
import { XMLParser } from "fast-xml-parser";
import { UF_CODES } from "@/lib/types";

// Manifestação do Destinatário — evento "Ciência da Operação" (tpEvento
// 210210). É pré-requisito da SEFAZ para liberar o XML completo (procNFe)
// de uma nota fiscal via Distribuição DFe: antes disso só o resumo (resNFe)
// fica disponível.
//
// Enviado ao webservice nacional de Recepção de Evento.
//
// ⚠️⚠️ HISTÓRICO DE DEPURAÇÃO (2026-11) — produção tinha 32 NF-e presas em
// "Resumo" pra sempre porque esse módulo nunca funcionou contra a SEFAZ
// real (nunca tinha sido validado antes). Quatro rodadas até achar as
// causas de verdade, todas confirmadas pelo mesmo SOAP Fault de transporte
// idêntico ("Unable to handle request. The action '...' was not
// recognized") voltando sem mudar, rodada após rodada, até a quarta:
// 1ª: endpoint de produção errado (`www1...` em vez de `www...` —
//     corrigido, mas sozinho não resolveu).
// 2ª: tentativa de header `SOAPAction` separado (hipótese SOAP 1.1) — não
//     ajudou, revertida.
// 3ª: `Content-Type` com espaços depois de `;` (devia ser sem) — corrigido
//     comparando com nfephp-org/sped-nfe (biblioteca PHP madura, usada em
//     produção por muitos sistemas), mas sozinho também não resolveu.
// 4ª — **causas reais, confirmadas no código-fonte da sped-nfe**
//     (`src/Tools.php::sefazEvento`), não em relatos de terceiros:
//   a) `tpEvento` errado: **210200 é "Confirmação da Operação"**, um
//      evento totalmente diferente — "Ciência da Operação" é **210210**.
//   b) Elemento raiz assinado errado: é `<evento>`, não `<eventoNFe>`
//      (que nunca existiu nesse schema — provável confusão com o `<NFe>`
//      da própria nota).
// Essas duas são bugs de conteúdo/schema, não de transporte — explicam
// por que nenhuma das 3 rodadas anteriores (endpoint, headers,
// Content-Type) mudava o resultado: a SEFAZ nunca chegava a aceitar a
// requisição como um evento reconhecível.
//
// AINDA NÃO CONFIRMADO contra uma resposta real da SEFAZ — mas essa é a
// primeira rodada baseada em diferença estrutural concreta no conteúdo do
// XML (não em formatação de transporte), encontrada comparando com uma
// implementação de referência real.

const ENDPOINTS = {
  PRODUCAO: "https://www.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
  HOMOLOGACAO:
    "https://hom1.nfe.fazenda.gov.br/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx",
} as const;

const SOAP_ACTION =
  "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento";

// ⚠️ "210200" É A CONFIRMAÇÃO DA OPERAÇÃO, NÃO A CIÊNCIA — bug real
// encontrado comparando com a sped-nfe (src/Tools.php: EVT_CONFIRMACAO =
// 210200, EVT_CIENCIA = 210210; são dois eventos distintos, cada um com
// suas próprias regras de negócio na SEFAZ). Corrigido pra 210210.
const TP_EVENTO_CIENCIA = "210210";
const DESC_EVENTO_CIENCIA = "Ciencia da Operacao";
const COD_ORGAO_AN = "91"; // Ambiente Nacional

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ⚠️ Horário de Brasília fixo (-03:00), NÃO derivado de
// `Date.getTimezoneOffset()` — esse método reflete o fuso do runtime onde o
// processo roda (na Vercel, UTC), não o do Brasil. O schema da NFe exige um
// offset dentro da faixa brasileira (-02:00 a -05:00); "+00:00" é
// sintaticamente inválido pro tipo `TDateTimeUTC` e pode estar sendo
// rejeitado antes mesmo de qualquer validação de negócio.
const BR_UTC_OFFSET = "-03:00";

/** Data/hora no formato exigido pelo schema da NFe: AAAA-MM-DDTHH:mm:ssTZD */
function dataHoraEvento(): string {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return (
    `${brasilia.getUTCFullYear()}-${pad2(brasilia.getUTCMonth() + 1)}-${pad2(brasilia.getUTCDate())}` +
    `T${pad2(brasilia.getUTCHours())}:${pad2(brasilia.getUTCMinutes())}:${pad2(brasilia.getUTCSeconds())}${BR_UTC_OFFSET}`
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

  // ⚠️ O elemento raiz assinado é <evento>, NÃO <eventoNFe> — confirmado
  // comparando com a sped-nfe (src/Tools.php:sefazEvento,
  // `$request = "<evento xmlns=\"$this->urlPortal\" versao=\"$this->urlVersion\">"...`).
  // <eventoNFe> nunca existiu nesse schema; provavelmente uma confusão com
  // o elemento raiz do XML da própria NF-e (<NFe>), que é diferente.
  const xml =
    `<evento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">` +
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
    `</evento>`;

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

// Prefixo "soap" (não "soap12") e as declarações xsi/xsd, mesmo sem uso
// direto no corpo — byte a byte igual ao que a sped-common
// (nfephp-org/sped-common, SoapBase::makeEnvelopeSoap + Tools::$soapnamespaces)
// manda de verdade pra esse mesmo webservice. O prefixo em si não muda o
// significado em XML (é só um apelido pro namespace), mas alinhar com uma
// referência confirmadamente funcional elimina mais uma diferença possível
// enquanto a causa raiz do "action not recognized" não é confirmada.
function montarEnvelope(eventoAssinado: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeRecepcaoEvento xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
      <nfeDadosMsg>
        <envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
          <idLote>1</idLote>
          ${eventoAssinado}
        </envEvento>
      </nfeDadosMsg>
    </nfeRecepcaoEvento>
  </soap:Body>
</soap:Envelope>`;
}

/** Remove o conteúdo pesado (certificado/assinatura em base64) do envelope
 * pra poder logar/mostrar a requisição real sem virar um blob ilegível de
 * milhares de caracteres. Nada aqui é segredo — é só a assinatura de um
 * evento público, não a chave privada nem a senha do certificado. */
function resumirEnvelopeParaDebug(envelope: string): string {
  return envelope
    .replace(/<X509Certificate>[^<]*<\/X509Certificate>/, "<X509Certificate>[omitido]</X509Certificate>")
    .replace(/<SignatureValue>[^<]*<\/SignatureValue>/, "<SignatureValue>[omitido]</SignatureValue>")
    .replace(/<DigestValue>[^<]*<\/DigestValue>/, "<DigestValue>[omitido]</DigestValue>");
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
          // SEM espaço depois dos ";" — byte a byte igual ao que a
          // sped-common (nfephp-org/sped-common, SoapCurl.php), biblioteca
          // PHP usada em produção por muitos sistemas, manda de verdade:
          // "application/soap+xml;charset=utf-8;action=\"...\"". O header
          // SOAPAction separado (SOAP 1.1) que uma rodada anterior desta
          // depuração tinha adicionado foi removido — a referência
          // confirmadamente funcional não manda esse header, só este
          // Content-Type.
          "Content-Type": `application/soap+xml;charset=utf-8;action="${SOAP_ACTION}"`,
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
            // Inclui a URL e o envelope que REALMENTE foi enviado (sem o
            // blob do certificado) — depois de 4 rodadas de depuração sem
            // conseguir mudar esse mesmo erro, o próximo passo é comparar a
            // requisição de verdade contra uma referência, não mais
            // teorizar sobre o que "deveria" estar sendo enviado.
            reject(
              new Error(
                `SEFAZ respondeu ${res.statusCode} em ${params.url}: ${body.slice(0, 500)} | Requisição enviada: ${resumirEnvelopeParaDebug(params.envelope)}`
              )
            );
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
