export type Ambiente = "PRODUCAO" | "HOMOLOGACAO";

export type NotaFiscalStatus = "RESUMO" | "COMPLETA";

export type SyncLogStatus = "EM_ANDAMENTO" | "SUCESSO" | "ERRO";

// Código IBGE de cada UF — exigido como cUFAutor nas chamadas ao webservice
// da SEFAZ (NFeDistribuicaoDFe), independentemente do endpoint ser nacional.
export const UF_CODES: Record<string, number> = {
  AC: 12,
  AL: 27,
  AP: 16,
  AM: 13,
  BA: 29,
  CE: 23,
  DF: 53,
  ES: 32,
  GO: 52,
  MA: 21,
  MT: 51,
  MS: 50,
  MG: 31,
  PA: 15,
  PB: 25,
  PR: 41,
  PE: 26,
  PI: 22,
  RJ: 33,
  RN: 24,
  RS: 43,
  RO: 11,
  RR: 14,
  SC: 42,
  SP: 35,
  SE: 28,
  TO: 17,
};

export const UF_LIST = Object.keys(UF_CODES).sort();
