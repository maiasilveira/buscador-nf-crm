import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

export type NotaResumida = {
  chaveAcesso: string;
  numero: string;
  serie: string;
  emitenteCnpj: string;
  emitenteNome: string;
  valorTotal: string;
  dataEmissao: Date;
};

/** Decodifica número e série a partir da chave de acesso de 44 dígitos —
 * disponíveis mesmo antes da manifestação/XML completo. Layout oficial:
 * cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1). */
export function decodificarChaveAcesso(chave: string) {
  if (chave.length !== 44) {
    throw new Error(`Chave de acesso com tamanho inválido: ${chave}`);
  }
  return {
    cnpj: chave.slice(6, 20),
    modelo: chave.slice(20, 22),
    serie: String(Number(chave.slice(22, 25))),
    numero: String(Number(chave.slice(25, 34))),
  };
}

/** Extrai os dados essenciais de um resNFe (resumo — sempre disponível,
 * mesmo sem manifestação). */
export function parseResNFe(xml: string): NotaResumida {
  const parsed = parser.parse(xml);
  const res = parsed?.resNFe;
  if (!res) {
    throw new Error("XML não é um resNFe válido.");
  }
  const chaveAcesso = String(res.chNFe);
  const { numero, serie } = decodificarChaveAcesso(chaveAcesso);
  return {
    chaveAcesso,
    numero,
    serie,
    emitenteCnpj: String(res.CNPJ ?? ""),
    emitenteNome: String(res.xNome ?? ""),
    valorTotal: String(res.vNF ?? "0"),
    dataEmissao: new Date(String(res.dhEmi)),
  };
}

/** Extrai os dados essenciais de um procNFe (XML completo, liberado após a
 * manifestação de ciência do destinatário). */
export function parseProcNFe(xml: string): NotaResumida {
  const parsed = parser.parse(xml);
  const infNFe = parsed?.nfeProc?.NFe?.infNFe ?? parsed?.NFe?.infNFe;
  if (!infNFe) {
    throw new Error("XML não é um procNFe/NFe válido.");
  }
  const chaveAcesso = String(infNFe["@_Id"] ?? "").replace(/^NFe/, "");
  return {
    chaveAcesso,
    numero: String(infNFe.ide?.nNF ?? ""),
    serie: String(infNFe.ide?.serie ?? ""),
    emitenteCnpj: String(infNFe.emit?.CNPJ ?? ""),
    emitenteNome: String(infNFe.emit?.xNome ?? ""),
    valorTotal: String(infNFe.total?.ICMSTot?.vNF ?? "0"),
    dataEmissao: new Date(String(infNFe.ide?.dhEmi)),
  };
}
