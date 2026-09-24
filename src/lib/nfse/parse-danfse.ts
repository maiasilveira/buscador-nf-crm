import { XMLParser } from "fast-xml-parser";

// Extrai do XML da NFS-e (padrão nacional) os campos necessários pra montar
// o DANFSe em PDF — versão mais completa do que parseNfse (que só serve
// pros custom fields do ClickUp).
//
// Validado em 2026-09 contra um XML real (produção, emissor Omie/Sistema
// Nacional NFS-e). Duas pegadinhas da estrutura real, corrigidas aqui:
// 1. Nome/endereço do prestador não vêm de <prest> (dentro da DPS enviada
//    pelo emissor — só tem CNPJ/fone/email/regTrib), e sim de <emit>,
//    elemento irmão de <DPS> dentro de <infNFSe>, preenchido pelo ADN a
//    partir do cadastro do prestador.
// 2. `xLocPrestacao` é filho direto de <infNFSe>, não de <infDPS>.
// Município da prestação e endereço do prestador ainda podem ficar parcial
// mesmo corrigido: o <enderNac> do emitente tem `cMun` (código IBGE), não
// necessariamente `xMun` (nome do município por extenso) — nesse caso
// usamos `xLocEmi`/`xLocPrestacao` (nome por extenso, sempre presentes)
// como município. Endereço do tomador segue com fallbacks defensivos (??)
// — a estrutura de `<toma><end>` mistura campos soltos (xLgr/nro/xBairro)
// com um `<endNac>` aninhado (cMun/CEP/UF), então `endereco()` procura em
// ambos os níveis.

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
  // Alguns emissores colocam tudo num só nível (emit.enderNac), outros
  // separam campo livre (xLgr/nro/xBairro, no nível de fora) de campo
  // nacional/padronizado (cMun/UF/CEP, dentro de um bloco aninhado) — ver
  // aviso no topo do arquivo. O nome do bloco aninhado também varia:
  // `enderNac` em <emit>, `endNac` (sem "er") em <toma>/<end> no XML real
  // já visto — procura os dois.
  const nac = (e.enderNac ?? e.endNac ?? {}) as Record<string, unknown>;
  const pick = (chave: string) => e[chave] ?? nac[chave] ?? "";
  return {
    logradouro: String(pick("xLgr")),
    numero: String(pick("nro")),
    complemento: String(pick("xCpl")),
    bairro: String(pick("xBairro")),
    municipio: String(pick("xMun")),
    uf: String(pick("UF")),
    cep: String(pick("CEP")),
  };
}

export function parseNfseDanfse(xml: string): DadosDanfse {
  const parsed = parser.parse(xml);
  const infNFSe = parsed?.NFSe?.infNFSe;
  if (!infNFSe) {
    throw new Error("XML não é uma NFSe válida — não é possível montar o DANFSe.");
  }
  const infDPS = infNFSe.DPS?.infDPS ?? infNFSe.DPS ?? {};

  const emit = (infNFSe.emit ?? {}) as Record<string, unknown>;
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

  // Nome por extenso do município do prestador/emissão — usado como
  // reserva quando o endereço nacional só traz o código IBGE (`cMun`), sem
  // o nome (`xMun`).
  const localEmissaoExtenso = String(infNFSe.xLocEmi ?? "");

  const prestadorEndereco = endereco(emit.enderNac as Record<string, unknown> | undefined);
  if (!prestadorEndereco.municipio) prestadorEndereco.municipio = localEmissaoExtenso;

  return {
    chaveAcesso,
    numero: String(infNFSe.nNFSe ?? infDPS.nDPS ?? ""),
    dataEmissao: new Date(String(dataEmissaoRaw ?? "")),
    competencia: String(infDPS.dCompet ?? ""),
    tpAmbiente: String(infNFSe.tpAmb ?? infDPS.tpAmb ?? "1"),

    prestadorCnpj: String(prest.CNPJ ?? emit.CNPJ ?? ""),
    prestadorNome: String(emit.xNome ?? prest.xNome ?? ""),
    prestadorIm: String(prest.IM ?? emit.IM ?? ""),
    prestadorEndereco,

    tomadorDocumento: String(toma.CNPJ ?? toma.CPF ?? ""),
    tomadorNome: String(toma.xNome ?? ""),
    tomadorEndereco: endereco(toma.end as Record<string, unknown> | undefined),

    municipioPrestacao: String(infNFSe.xLocPrestacao ?? "") || prestadorEndereco.municipio,
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
