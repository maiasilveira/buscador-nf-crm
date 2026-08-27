import { XMLParser } from "fast-xml-parser";

// Parsing do XML da NFS-e no padrão nacional (elemento <NFSe><infNFSe>...
// envolvendo a <DPS> — Declaração de Prestação de Serviço — enviada pelo
// prestador). Assim como o cliente (client.ts), os nomes exatos dos campos
// abaixo seguem a estrutura publicamente descrita para o padrão nacional,
// mas não foram validados contra um XML real emitido pelo ambiente de
// produção — se algum campo vier vazio depois de uma sincronização real,
// comece a depuração por aqui.

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
});

export type NotaServicoResumida = {
  chaveAcesso: string;
  numero: string;
  prestadorCnpj: string;
  prestadorNome: string;
  tomadorCnpj: string;
  valorServico: string;
  discriminacao: string | null;
  dataEmissao: Date;
};

export function parseNfse(xml: string): NotaServicoResumida {
  const parsed = parser.parse(xml);
  const infNFSe = parsed?.NFSe?.infNFSe;
  if (!infNFSe) {
    throw new Error("XML não é uma NFSe válida (elemento infNFSe não encontrado).");
  }

  const infDPS = infNFSe.DPS?.infDPS ?? infNFSe.DPS;
  const chaveAcesso = String(infNFSe["@_Id"] ?? infDPS?.["@_Id"] ?? "");
  const numero = String(infNFSe.nNFSe ?? infDPS?.nDPS ?? "");

  const prest = infDPS?.prest ?? {};
  const toma = infDPS?.toma ?? {};
  const valores = infDPS?.valores ?? infNFSe.valores ?? {};

  const valorServico = String(
    valores?.vServPrest?.vServ ?? valores?.vLiq ?? infNFSe.valores?.vLiq ?? "0"
  );

  const discriminacao = infDPS?.serv?.cServ?.xDescServ
    ? String(infDPS.serv.cServ.xDescServ)
    : null;

  const dataEmissaoRaw = infDPS?.dhEmi ?? infDPS?.dCompet ?? infNFSe.dhProc;

  return {
    chaveAcesso,
    numero,
    prestadorCnpj: String(prest.CNPJ ?? ""),
    prestadorNome: String(prest.xNome ?? ""),
    tomadorCnpj: String(toma.CNPJ ?? ""),
    valorServico,
    discriminacao,
    dataEmissao: new Date(String(dataEmissaoRaw)),
  };
}
