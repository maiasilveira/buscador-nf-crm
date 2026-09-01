import { XMLParser } from "fast-xml-parser";

// Extrai do procNFe (XML completo) todos os campos necessários pra montar o
// DANFE em PDF — bem mais dados do que o parseProcNFe "resumido" em parse.ts
// (que só serve pra popular os custom fields do ClickUp). Só funciona a
// partir do XML completo: o resumo (resNFe) não traz itens, impostos,
// endereços etc.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Mesmo motivo do parser em parse.ts — nunca deixar o fast-xml-parser
  // converter texto pra Number (chave de acesso, CNPJ, NCM/CFOP com zero à
  // esquerda, etc. são todos tratados como string aqui).
  parseTagValue: false,
});

export type EnderecoDanfe = {
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  fone: string;
};

export type ItemDanfe = {
  numero: string;
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valorUnitario: string;
  valorTotal: string;
  cstIcms: string;
  baseCalculoIcms: string;
  valorIcms: string;
  valorIpi: string;
};

export type DuplicataDanfe = {
  numero: string;
  vencimento: string;
  valor: string;
};

export type DadosDanfe = {
  chaveAcesso: string;
  numero: string;
  serie: string;
  naturezaOperacao: string;
  dataEmissao: Date;
  dataSaidaEntrada: Date | null;
  tipoOperacao: string; // "0" entrada | "1" saída
  protocolo: string;
  dataProtocolo: Date | null;
  tpAmbiente: string; // "1" produção | "2" homologação

  emitCnpj: string;
  emitNome: string;
  emitFantasia: string;
  emitIe: string;
  emitEndereco: EnderecoDanfe;

  destDocumento: string; // CNPJ ou CPF
  destNome: string;
  destIe: string;
  destEndereco: EnderecoDanfe;

  itens: ItemDanfe[];

  totalProdutos: string;
  totalBaseIcms: string;
  totalIcms: string;
  totalBaseIcmsSt: string;
  totalIcmsSt: string;
  totalIpi: string;
  totalFrete: string;
  totalSeguro: string;
  totalDesconto: string;
  totalOutrasDespesas: string;
  totalTributos: string;
  totalNota: string;

  modalidadeFrete: string;
  transportadoraNome: string;
  transportadoraCnpj: string;
  veiculoPlaca: string;
  veiculoUf: string;
  volumesQtd: string;
  volumesEspecie: string;
  volumesPesoLiquido: string;
  volumesPesoBruto: string;

  duplicatas: DuplicataDanfe[];

  informacoesComplementares: string;
};

function endereco(end: Record<string, unknown> | undefined): EnderecoDanfe {
  const e = end ?? {};
  return {
    logradouro: String(e.xLgr ?? ""),
    numero: String(e.nro ?? ""),
    complemento: String(e.xCpl ?? ""),
    bairro: String(e.xBairro ?? ""),
    municipio: String(e.xMun ?? ""),
    uf: String(e.UF ?? ""),
    cep: String(e.CEP ?? ""),
    fone: String(e.fone ?? ""),
  };
}

/** Os grupos ICMS/IPI/PIS/COFINS por item variam de nome conforme o CST/CSOSN
 * (ex: ICMS00, ICMS10, ICMS20... ICMSSN101...), mas cada nota só tem UM
 * desses preenchido — pegamos o primeiro (e único) valor do objeto, seja
 * qual for a chave. */
function primeiroGrupo(obj: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!obj) return {};
  const valores = Object.values(obj);
  return (valores[0] as Record<string, unknown>) ?? {};
}

function parseItem(det: Record<string, unknown>): ItemDanfe {
  const prod = (det.prod ?? {}) as Record<string, unknown>;
  const imposto = (det.imposto ?? {}) as Record<string, unknown>;
  const icms = primeiroGrupo(imposto.ICMS as Record<string, unknown> | undefined);
  const ipi = primeiroGrupo(
    (imposto.IPI as Record<string, unknown> | undefined)?.IPITrib as
      | Record<string, unknown>
      | undefined
  );

  return {
    numero: String(det["@_nItem"] ?? ""),
    codigo: String(prod.cProd ?? ""),
    descricao: String(prod.xProd ?? ""),
    ncm: String(prod.NCM ?? ""),
    cfop: String(prod.CFOP ?? ""),
    unidade: String(prod.uCom ?? ""),
    quantidade: String(prod.qCom ?? ""),
    valorUnitario: String(prod.vUnCom ?? ""),
    valorTotal: String(prod.vProd ?? "0"),
    cstIcms: String(icms.CST ?? icms.CSOSN ?? ""),
    baseCalculoIcms: String(icms.vBC ?? "0"),
    valorIcms: String(icms.vICMS ?? "0"),
    valorIpi: String(ipi.vIPI ?? "0"),
  };
}

function parseDuplicata(dup: Record<string, unknown>): DuplicataDanfe {
  return {
    numero: String(dup.nDup ?? ""),
    vencimento: String(dup.dVenc ?? ""),
    valor: String(dup.vDup ?? "0"),
  };
}

function comoArray<T>(valor: T | T[] | undefined): T[] {
  if (valor === undefined) return [];
  return Array.isArray(valor) ? valor : [valor];
}

// Versões curtas — precisam caber numa linha só na coluna do quadro
// Transportador do DANFE. "0" Remetente=CIF, "1" Destinatário=FOB.
const MODALIDADE_FRETE: Record<string, string> = {
  "0": "CIF (remetente)",
  "1": "FOB (destinatário)",
  "2": "Por conta de terceiros",
  "3": "Próprio (remetente)",
  "4": "Próprio (destinatário)",
  "9": "Sem transporte",
};

export function parseProcNFeDanfe(xml: string): DadosDanfe {
  const parsed = parser.parse(xml);
  const nfe = parsed?.nfeProc?.NFe ?? parsed?.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) {
    throw new Error("XML não é um procNFe/NFe válido — não é possível montar o DANFE.");
  }
  const infProt = parsed?.nfeProc?.protNFe?.infProt;

  const ide = (infNFe.ide ?? {}) as Record<string, unknown>;
  const emit = (infNFe.emit ?? {}) as Record<string, unknown>;
  const dest = (infNFe.dest ?? {}) as Record<string, unknown>;
  const total = (infNFe.total?.ICMSTot ?? {}) as Record<string, unknown>;
  const transp = (infNFe.transp ?? {}) as Record<string, unknown>;
  const cobr = (infNFe.cobr ?? {}) as Record<string, unknown>;
  const infAdic = (infNFe.infAdic ?? {}) as Record<string, unknown>;

  const detBruto = comoArray(infNFe.det as Record<string, unknown> | Record<string, unknown>[]);
  const itens = detBruto.map(parseItem);

  const transportadora = (transp.transporta ?? {}) as Record<string, unknown>;
  const veiculo = (transp.veicTransp ?? {}) as Record<string, unknown>;
  const volumesBrutos = comoArray(transp.vol as Record<string, unknown> | Record<string, unknown>[]);
  const volume = volumesBrutos[0] ?? {};

  const duplicatasBrutas = comoArray(cobr.dup as Record<string, unknown> | Record<string, unknown>[]);

  const chaveAcesso = String(infNFe["@_Id"] ?? "").replace(/^NFe/, "");

  return {
    chaveAcesso,
    numero: String(ide.nNF ?? ""),
    serie: String(ide.serie ?? ""),
    naturezaOperacao: String(ide.natOp ?? ""),
    dataEmissao: new Date(String(ide.dhEmi ?? "")),
    dataSaidaEntrada: ide.dhSaiEnt ? new Date(String(ide.dhSaiEnt)) : null,
    tipoOperacao: String(ide.tpNF ?? "1"),
    protocolo: String(infProt?.nProt ?? ""),
    dataProtocolo: infProt?.dhRecbto ? new Date(String(infProt.dhRecbto)) : null,
    tpAmbiente: String(ide.tpAmb ?? "1"),

    emitCnpj: String(emit.CNPJ ?? ""),
    emitNome: String(emit.xNome ?? ""),
    emitFantasia: String(emit.xFant ?? ""),
    emitIe: String(emit.IE ?? ""),
    emitEndereco: endereco(emit.enderEmit as Record<string, unknown> | undefined),

    destDocumento: String(dest.CNPJ ?? dest.CPF ?? ""),
    destNome: String(dest.xNome ?? ""),
    destIe: String(dest.IE ?? ""),
    destEndereco: endereco(dest.enderDest as Record<string, unknown> | undefined),

    itens,

    totalProdutos: String(total.vProd ?? "0"),
    totalBaseIcms: String(total.vBC ?? "0"),
    totalIcms: String(total.vICMS ?? "0"),
    totalBaseIcmsSt: String(total.vBCST ?? "0"),
    totalIcmsSt: String(total.vST ?? "0"),
    totalIpi: String(total.vIPI ?? "0"),
    totalFrete: String(total.vFrete ?? "0"),
    totalSeguro: String(total.vSeg ?? "0"),
    totalDesconto: String(total.vDesc ?? "0"),
    totalOutrasDespesas: String(total.vOutro ?? "0"),
    totalTributos: String(total.vTotTrib ?? "0"),
    totalNota: String(total.vNF ?? "0"),

    modalidadeFrete: MODALIDADE_FRETE[String(transp.modFrete ?? "9")] ?? "Não informado",
    transportadoraNome: String(transportadora.xNome ?? ""),
    transportadoraCnpj: String(transportadora.CNPJ ?? ""),
    veiculoPlaca: String(veiculo.placa ?? ""),
    veiculoUf: String(veiculo.UF ?? ""),
    volumesQtd: String(volume.qVol ?? ""),
    volumesEspecie: String(volume.esp ?? ""),
    volumesPesoLiquido: String(volume.pesoL ?? ""),
    volumesPesoBruto: String(volume.pesoB ?? ""),

    duplicatas: duplicatasBrutas.map(parseDuplicata),

    informacoesComplementares: String(infAdic.infCpl ?? ""),
  };
}
