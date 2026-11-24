// Extrai o número do pedido de compra do texto livre de observações/
// informações complementares da nota (infAdic/infCpl da NF-e, infCpl da
// NFS-e) — convenção interna da empresa: pede-se ao fornecedor que inclua
// o número do pedido/contratação aprovada nesse campo, pra conferência
// cruzada depois.
//
// Validado em 2026-11 contra 3 DANFEs reais de fornecedores diferentes:
//   "DOCUMENTO EMITIDO POR ME OU EPP OPTANTE PELO SIMPLES NACIONAL|Pedido de Compra N: 000335"
//   "PEDIDO DE COMPRA: 000587;DADOS BANCARIOS: BANCO DO BRASIL;..."
//   "PEDIDO 000026 [ VR.APROX.TRIBUTOS R$ 1425.42 (33.00 %) FONTE:IBPT ..."
// Cada fornecedor/ERP formata diferente (com ou sem "de compra", ":"/"N:"/
// nada antes do número, e o campo frequentemente concatena outras
// informações soltas com "|"/";"). Por isso o padrão usa uma palavra-chave
// + "até N caracteres não-numéricos" + o número, em vez de tentar prever
// cada separador possível — tolera a variação sem ficar frágil demais.
const GAP = "[^\\d]{0,15}"; // pontuação/texto curto entre a palavra-chave e o número
const PADROES: RegExp[] = [
  new RegExp(`pedido(?:\\s*de\\s*compra)?${GAP}(\\d{1,10})`, "i"),
  new RegExp(`ordem\\s*de\\s*compra${GAP}(\\d{1,10})`, "i"),
  new RegExp(`\\bo\\.?\\s*c\\.?${GAP}(\\d{1,10})\\b`, "i"),
];

/** Retorna o número do pedido encontrado (com os zeros à esquerda como no
 * original — ex: "000335"), ou null se nenhum padrão conhecido bateu. */
export function extrairNumeroPedido(texto: string | null | undefined): string | null {
  if (!texto) return null;
  for (const padrao of PADROES) {
    const match = texto.match(padrao);
    if (match) return match[1];
  }
  return null;
}
