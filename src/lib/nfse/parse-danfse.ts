import { XMLParser } from "fast-xml-parser";

// Extrai do XML da NFS-e (padrão nacional) os campos necessários pra montar
// o DANFSe em PDF — versão mais completa do que parseNfse (que só serve
// pros custom fields do ClickUp). MESMO CAVEAT do resto do módulo NFS-e
// (veja README): a estrutura exata do XML do Ambiente de Dados Nacional
// não foi validada contra um documento real nesta sessão — os campos abaixo
// seguem a especificação pública do padrão nacional, com fallbacks
// defensivos (??) para não quebrar se algum nome de tag vier diferente.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
});

export type EnderecoDanfse = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
};

export type DadosDanfse = {
  chaveAcesso: string;
  numero: string;
  dataEmissao: Date;
  competencia: string;
  tpAmbiente: string; // "1" produção | "2" homologação

  prestadorCnpj: string;
  prestadorNome: string;
  prestadorIm: string; // inscrição municipal
  prestadorEndereco: EnderecoDanfse;

  tomadorDocumento: string;
  tomadorNome: string;
  tomadorEndereco: EnderecoDanfse;

  municipioPrestacao: string;
  codigoServico: string;
  descricaoServico: string;

  valorServico: string;
  valorDesconto: string;
  valorDeducao: string;
  baseCalculoIss: string;
  aliquotaIss: string;
  valorIss: string;
  issRetido: boolean;
  valorPis: string;
  valorCofins: string;
  valorIr: string;
  valorInss: string;
  valorCsll: string;
  valorLiquido: string;

  informacoesComplementares: string;
};

function endereco(end: Record<string, unknown> | undefined): EnderecoDanfse {
  const e = end ?? {};
  return {
    logradouro: String(e.xLgr ?? ""),
    numero: String(e.nro ?? ""),
    complemento: String(e.xCpl ?? ""),
    bairro: String(e.xBairro ?? ""),
    municipio: String(e.xMun ?? ""),
    uf: String(e.UF ?? ""),
    cep: String(e.CEP ?? ""),
  };
}

export function parseNfseDanfse(xml: string): DadosDanfse {
  const parsed = parser.parse(xml);
  const infNFSe = parsed?.NFSe?.infNFSe;
  if (!infNFSe) {
    throw new Error("XML não é uma NFSe válida — não é possível montar o DANFSe.");
  }
  const infDPS = infNFSe.DPS?.infDPS ?? infNFSe.DPS ?? {};

  const prest = (infDPS.prest ?? {}) as Record<string, unknown>;
  const toma = (infDPS.toma ?? {}) as Record<string, unknown>;
  const serv = (infDPS.serv ?? {}) as Record<string, unknown>;
  const cServ = (serv.cServ ?? {}) as Record<string, unknown>;
  const valores = (infDPS.valores ?? infNFSe.valores ?? {}) as Record<string, unknown>;
  const vServPrest = (valores.vServPrest ?? {}) as Record<string, unknown>;
  const trib = (valores.trib ?? {}) as Record<string, unknown>;
  const tribMun = (trib.tribMun ?? {}) as Record<string, unknown>;
  const tribFed = (trib.tribFed ?? {}) as Record<string, unknown>;
  const piscofins = (tribFed.piscofins ?? {}) as Record<string, unknown>;

  const chaveAcesso = String(infNFSe["@_Id"] ?? infDPS["@_Id"] ?? "");
  const dataEmissaoRaw = infDPS.dhEmi ?? infNFSe.dhProc;

  return {
    chaveAcesso,
    numero: String(infNFSe.nNFSe ?? infDPS.nDPS ?? ""),
    dataEmissao: new Date(String(dataEmissaoRaw ?? "")),
    competencia: String(infDPS.dCompet ?? ""),
    tpAmbiente: String(infNFSe.tpAmb ?? infDPS.tpAmb ?? "1"),

    prestadorCnpj: String(prest.CNPJ ?? ""),
    prestadorNome: String(prest.xNome ?? ""),
    prestadorIm: String(prest.IM ?? ""),
    prestadorEndereco: endereco(prest.enderNac as Record<string, unknown> | undefined),

    tomadorDocumento: String(toma.CNPJ ?? toma.CPF ?? ""),
    tomadorNome: String(toma.xNome ?? ""),
    tomadorEndereco: endereco(toma.end as Record<string, unknown> | undefined),

    municipioPrestacao: String(
      infDPS.xLocPrestacao ?? (prest.enderNac as Record<string, unknown> | undefined)?.xMun ?? ""
    ),
    codigoServico: String(cServ.cTribNac ?? ""),
    descricaoServico: String(cServ.xDescServ ?? ""),

    valorServico: String(vServPrest.vServ ?? valores.vLiq ?? "0"),
    valorDesconto: String(valores.vDescCondIncond ?? "0"),
    valorDeducao: String(valores.vDedRed ?? "0"),
    baseCalculoIss: String(tribMun.vBC ?? "0"),
    aliquotaIss: String(tribMun.pAliqAplic ?? tribMun.pAliq ?? "0"),
    valorIss: String(tribMun.vISSQN ?? "0"),
    issRetido: String(tribMun.tpRetISSQN ?? "") === "2",
    valorPis: String(piscofins.vPis ?? "0"),
    valorCofins: String(piscofins.vCofins ?? "0"),
    valorIr: String(tribFed.vRetIRRF ?? "0"),
    valorInss: String(tribFed.vRetCP ?? "0"),
    valorCsll: String(tribFed.vRetCSLL ?? "0"),
    valorLiquido: String(valores.vLiq ?? vServPrest.vServ ?? "0"),

    informacoesComplementares: String(infDPS.infCpl ?? ""),
  };
}
