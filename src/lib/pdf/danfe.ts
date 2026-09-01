import "server-only";
import PDFDocument from "pdfkit";
import bwipjs from "bwip-js/node";
import type { DadosDanfe, ItemDanfe } from "@/lib/sefaz/parse-danfe";

// Gera um PDF no estilo DANFE (Documento Auxiliar da NF-e) a partir dos dados
// extraídos do procNFe — ver src/lib/sefaz/parse-danfe.ts.
//
// IMPORTANTE: isso reproduz a ESTRUTURA e o CONTEÚDO do DANFE oficial
// (canhoto, dados do emitente/destinatário, itens, totais de impostos,
// transporte, código de barras da chave de acesso) num layout limpo e
// completo — mas não é uma réplica pixel-a-pixel do layout regulamentar do
// Manual de Orientação do Contribuinte (posições/medidas em mm exatas).
// Serve como comprovante/registro interno para a contabilidade; não
// substitui o DANFE gerado pelo emissor original da nota quando for exigida
// a forma impressa oficial (ex: acompanhar mercadoria em trânsito).

const MARGIN = 28;
const PAGE_WIDTH = 595.28; // A4 em pt
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function fmtMoeda(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : valor;
}

function fmtData(data: Date | null): string {
  if (!data || Number.isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR");
}

function fmtDataHora(data: Date | null): string {
  if (!data || Number.isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR");
}

function fmtDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  return doc;
}

async function gerarBarcodeChave(chave: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: "code128",
    text: chave,
    scale: 2,
    height: 12,
    includetext: false,
    backgroundcolor: "FFFFFF",
  });
}

function secaoTitulo(doc: PDFKit.PDFDocument, x: number, y: number, texto: string) {
  doc.font("Helvetica-Bold").fontSize(6).fillColor("#555").text(texto.toUpperCase(), x, y);
}

function campo(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  rotulo: string,
  valor: string,
  opts?: { fontSize?: number }
) {
  const fontSize = opts?.fontSize ?? 8;
  // height + ellipsis em ambas as linhas: nem o rótulo nem o valor podem
  // quebrar pra uma segunda linha e invadir o campo seguinte — os quadros
  // do DANFE são compactos e cada campo tem só uma linha de altura.
  doc
    .font("Helvetica")
    .fontSize(5.5)
    .fillColor("#666")
    .text(rotulo, x, y, { width: w, height: 6, ellipsis: true });
  doc
    .font("Helvetica")
    .fontSize(fontSize)
    .fillColor("#000")
    .text(valor || "-", x, y + 7, { width: w, height: fontSize + 1, ellipsis: true });
}

function caixa(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke("#000");
}

export async function gerarDanfePdf(dados: DadosDanfe): Promise<Buffer> {
  const barcode = await gerarBarcodeChave(dados.chaveAcesso);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;
    const x0 = MARGIN;

    // --- Canhoto (recibo de entrega) ---------------------------------
    caixa(doc, x0, y, CONTENT_WIDTH, 42);
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .fillColor("#000")
      .text(
        `RECEBEMOS DE ${dados.emitNome} OS PRODUTOS/SERVIÇOS CONSTANTES DA NOTA FISCAL ELETRÔNICA ` +
          `INDICADA ABAIXO. EMISSÃO: ${fmtData(dados.dataEmissao)}  VALOR TOTAL: R$ ${fmtMoeda(dados.totalNota)} DESTINATÁRIO: ${dados.destNome}`,
        x0 + 4,
        y + 4,
        { width: CONTENT_WIDTH - 4 }
      );
    doc
      .moveTo(x0 + 4, y + 26)
      .lineTo(x0 + CONTENT_WIDTH * 0.75, y + 26)
      .stroke("#000");
    doc.fontSize(5.5).text("DATA DE RECEBIMENTO / IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR", x0 + 4, y + 28);
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`NF-e Nº ${dados.numero}  SÉRIE ${dados.serie}`, x0 + CONTENT_WIDTH * 0.76, y + 12, {
        width: CONTENT_WIDTH * 0.24 - 4,
        align: "right",
      });
    y += 42 + 6;

    // --- Cabeçalho: emitente | DANFE | chave/barcode ------------------
    const headerH = 90;
    const colEmitW = CONTENT_WIDTH * 0.42;
    const colDanfeW = CONTENT_WIDTH * 0.2;
    const colChaveW = CONTENT_WIDTH - colEmitW - colDanfeW;

    caixa(doc, x0, y, colEmitW, headerH);
    // height + ellipsis força uma linha só — um nome comprido não pode
    // quebrar e invadir a linha do fantasia/endereço logo abaixo.
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor("#000")
      .text(dados.emitNome, x0 + 6, y + 6, {
        width: colEmitW - 12,
        height: 13,
        ellipsis: true,
      });
    if (dados.emitFantasia) {
      doc.font("Helvetica").fontSize(7.5).text(dados.emitFantasia, x0 + 6, y + 20, { width: colEmitW - 12 });
    }
    const end = dados.emitEndereco;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        `${end.logradouro}, ${end.numero}${end.complemento ? " - " + end.complemento : ""}`,
        x0 + 6,
        y + 34,
        { width: colEmitW - 12 }
      )
      .text(`${end.bairro} - ${end.municipio}/${end.uf} - CEP ${end.cep}`, x0 + 6, y + 46, {
        width: colEmitW - 12,
      })
      .text(`Fone: ${end.fone || "-"}`, x0 + 6, y + 58, { width: colEmitW - 12 })
      .text(`CNPJ: ${fmtDocumento(dados.emitCnpj)}   IE: ${dados.emitIe || "-"}`, x0 + 6, y + 70, {
        width: colEmitW - 12,
      });

    const xDanfe = x0 + colEmitW;
    caixa(doc, xDanfe, y, colDanfeW, headerH);
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .text("DANFE", xDanfe, y + 8, { width: colDanfeW, align: "center" });
    doc
      .font("Helvetica")
      .fontSize(6)
      .text("Documento Auxiliar da Nota Fiscal Eletrônica", xDanfe + 4, y + 26, {
        width: colDanfeW - 8,
        align: "center",
      });
    doc
      .fontSize(6.5)
      .text(
        dados.tipoOperacao === "0" ? "0 - ENTRADA" : "1 - SAÍDA",
        xDanfe + 4,
        y + 44,
        { width: colDanfeW - 8, align: "center" }
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Nº ${dados.numero}`, xDanfe + 4, y + 56, { width: colDanfeW - 8, align: "center" })
      .text(`Série ${dados.serie}`, xDanfe + 4, y + 68, { width: colDanfeW - 8, align: "center" });
    if (dados.tpAmbiente === "2") {
      doc
        .font("Helvetica-Bold")
        .fontSize(6.5)
        .fillColor("#b00")
        .text("AMBIENTE DE HOMOLOGAÇÃO — SEM VALOR FISCAL", xDanfe + 4, y + 80, {
          width: colDanfeW - 8,
          align: "center",
        })
        .fillColor("#000");
    }

    const xChave = xDanfe + colDanfeW;
    caixa(doc, xChave, y, colChaveW, headerH);
    doc.image(barcode, xChave + 8, y + 6, { width: colChaveW - 16, height: 28 });
    doc
      .font("Helvetica")
      .fontSize(7)
      .text(
        dados.chaveAcesso.replace(/(\d{4})(?=\d)/g, "$1 "),
        xChave + 4,
        y + 38,
        { width: colChaveW - 8, align: "center" }
      );
    doc
      .fontSize(5.5)
      .text(
        "Consulta de autenticidade no portal nacional da NF-e www.nfe.fazenda.gov.br, no site da " +
          "Sefaz autorizadora ou em ambiente de homologação, conforme o caso",
        xChave + 4,
        y + 50,
        { width: colChaveW - 8, align: "center" }
      );
    doc
      .font("Helvetica-Bold")
      .fontSize(6)
      .text(`PROTOCOLO DE AUTORIZAÇÃO DE USO`, xChave + 4, y + 68, { width: colChaveW - 8 });
    doc
      .font("Helvetica")
      .fontSize(6.5)
      .text(
        dados.protocolo
          ? `${dados.protocolo} ${fmtDataHora(dados.dataProtocolo)}`
          : "Não disponível",
        xChave + 4,
        y + 76,
        { width: colChaveW - 8 }
      );
    y += headerH + 4;

    // --- Natureza da operação ------------------------------------------
    caixa(doc, x0, y, CONTENT_WIDTH, 20);
    campo(doc, x0 + 4, y + 2, CONTENT_WIDTH - 8, "NATUREZA DA OPERAÇÃO", dados.naturezaOperacao);
    y += 20 + 4;

    // --- Destinatário / Remetente ---------------------------------------
    secaoTitulo(doc, x0, y, "Destinatário / Remetente");
    y += 8;
    const destH = 46;
    caixa(doc, x0, y, CONTENT_WIDTH, destH);
    const destColW = CONTENT_WIDTH / 3;
    campo(doc, x0 + 4, y + 2, CONTENT_WIDTH * 0.55, "NOME/RAZÃO SOCIAL", dados.destNome);
    campo(doc, x0 + CONTENT_WIDTH * 0.55, y + 2, CONTENT_WIDTH * 0.25, "CNPJ/CPF", fmtDocumento(dados.destDocumento));
    campo(doc, x0 + CONTENT_WIDTH * 0.8, y + 2, CONTENT_WIDTH * 0.2, "DATA EMISSÃO", fmtData(dados.dataEmissao));
    const dend = dados.destEndereco;
    campo(
      doc,
      x0 + 4,
      y + 18,
      CONTENT_WIDTH * 0.55,
      "ENDEREÇO",
      `${dend.logradouro}, ${dend.numero}${dend.complemento ? " - " + dend.complemento : ""} - ${dend.bairro}`
    );
    campo(doc, x0 + CONTENT_WIDTH * 0.55, y + 18, destColW * 0.5, "MUNICÍPIO", dend.municipio);
    campo(doc, x0 + CONTENT_WIDTH * 0.8, y + 18, CONTENT_WIDTH * 0.2, "DATA SAÍDA/ENTRADA", fmtData(dados.dataSaidaEntrada));
    campo(doc, x0 + 4, y + 32, CONTENT_WIDTH * 0.2, "UF", dend.uf);
    campo(doc, x0 + CONTENT_WIDTH * 0.2, y + 32, CONTENT_WIDTH * 0.3, "CEP", dend.cep);
    campo(doc, x0 + CONTENT_WIDTH * 0.5, y + 32, CONTENT_WIDTH * 0.3, "INSCRIÇÃO ESTADUAL", dados.destIe);
    y += destH + 4;

    // --- Cálculo do imposto ----------------------------------------------
    secaoTitulo(doc, x0, y, "Cálculo do Imposto");
    y += 8;
    const impH = 40;
    caixa(doc, x0, y, CONTENT_WIDTH, impH);
    const impCols = [
      ["BASE DE CÁLC. ICMS", dados.totalBaseIcms],
      ["VALOR DO ICMS", dados.totalIcms],
      ["BASE DE CÁLC. ICMS ST", dados.totalBaseIcmsSt],
      ["VALOR DO ICMS ST", dados.totalIcmsSt],
      ["VALOR TOTAL PRODUTOS", dados.totalProdutos],
    ];
    const impColsLinha2 = [
      ["VALOR DO FRETE", dados.totalFrete],
      ["VALOR DO SEGURO", dados.totalSeguro],
      ["DESCONTO", dados.totalDesconto],
      ["OUTRAS DESP.", dados.totalOutrasDespesas],
      ["VALOR DO IPI", dados.totalIpi],
      ["VALOR TOTAL DA NOTA", dados.totalNota],
    ];
    const w1 = CONTENT_WIDTH / impCols.length;
    impCols.forEach(([rotulo, valor], i) => campo(doc, x0 + 4 + i * w1, y + 2, w1 - 4, rotulo, `R$ ${fmtMoeda(valor)}`, { fontSize: 7 }));
    const w2 = CONTENT_WIDTH / impColsLinha2.length;
    impColsLinha2.forEach(([rotulo, valor], i) =>
      campo(doc, x0 + 4 + i * w2, y + 21, w2 - 4, rotulo, `R$ ${fmtMoeda(valor)}`, { fontSize: 7 })
    );
    y += impH + 4;

    // --- Transportador ------------------------------------------------
    secaoTitulo(doc, x0, y, "Transportador / Volumes Transportados");
    y += 8;
    const transpH = 30;
    caixa(doc, x0, y, CONTENT_WIDTH, transpH);
    campo(doc, x0 + 4, y + 2, CONTENT_WIDTH * 0.4, "NOME/RAZÃO SOCIAL", dados.transportadoraNome || "-");
    campo(doc, x0 + CONTENT_WIDTH * 0.4, y + 2, CONTENT_WIDTH * 0.2, "FRETE POR CONTA", dados.modalidadeFrete);
    campo(doc, x0 + CONTENT_WIDTH * 0.6, y + 2, CONTENT_WIDTH * 0.2, "PLACA/UF", `${dados.veiculoPlaca || "-"} ${dados.veiculoUf}`);
    campo(doc, x0 + CONTENT_WIDTH * 0.8, y + 2, CONTENT_WIDTH * 0.2, "CNPJ", dados.transportadoraCnpj ? fmtDocumento(dados.transportadoraCnpj) : "-");
    campo(doc, x0 + 4, y + 16, CONTENT_WIDTH * 0.25, "QTD. VOLUMES", dados.volumesQtd || "-");
    campo(doc, x0 + CONTENT_WIDTH * 0.25, y + 16, CONTENT_WIDTH * 0.25, "ESPÉCIE", dados.volumesEspecie || "-");
    campo(doc, x0 + CONTENT_WIDTH * 0.5, y + 16, CONTENT_WIDTH * 0.25, "PESO LÍQUIDO", dados.volumesPesoLiquido || "-");
    campo(doc, x0 + CONTENT_WIDTH * 0.75, y + 16, CONTENT_WIDTH * 0.25, "PESO BRUTO", dados.volumesPesoBruto || "-");
    y += transpH + 4;

    // --- Duplicatas (se houver) -----------------------------------------
    if (dados.duplicatas.length > 0) {
      secaoTitulo(doc, x0, y, "Duplicatas / Fatura");
      y += 8;
      const dupH = 16;
      caixa(doc, x0, y, CONTENT_WIDTH, dupH);
      const dupTexto = dados.duplicatas
        .map((d) => `${d.numero}: venc. ${fmtData(new Date(d.vencimento))} — R$ ${fmtMoeda(d.valor)}`)
        .join("   |   ");
      doc.font("Helvetica").fontSize(7).text(dupTexto, x0 + 4, y + 4, { width: CONTENT_WIDTH - 8 });
      y += dupH + 4;
    }

    // --- Itens ----------------------------------------------------------
    secaoTitulo(doc, x0, y, "Dados dos Produtos / Serviços");
    y += 8;
    y = desenharTabelaItens(doc, dados.itens, x0, y);

    // --- Dados adicionais -------------------------------------------------
    if (dados.informacoesComplementares) {
      secaoTitulo(doc, x0, y, "Dados Adicionais");
      y += 8;
      doc
        .font("Helvetica")
        .fontSize(7)
        .fillColor("#000")
        .text(dados.informacoesComplementares, x0, y, { width: CONTENT_WIDTH });
    }

    doc.end();
  });
}

const COLS_ITEM: { titulo: string; largura: number; align?: "left" | "right" }[] = [
  { titulo: "CÓD.", largura: 0.09 },
  { titulo: "DESCRIÇÃO", largura: 0.27 },
  { titulo: "NCM", largura: 0.08 },
  { titulo: "CST", largura: 0.06 },
  { titulo: "CFOP", largura: 0.06 },
  { titulo: "UN", largura: 0.05 },
  { titulo: "QTD", largura: 0.08, align: "right" },
  { titulo: "V. UNIT", largura: 0.1, align: "right" },
  { titulo: "V. TOTAL", largura: 0.1, align: "right" },
  { titulo: "V. ICMS", largura: 0.11, align: "right" },
];

function desenharTabelaItens(
  doc: PDFKit.PDFDocument,
  itens: ItemDanfe[],
  x0: number,
  yInicial: number
): number {
  const rowH = 14;
  const headerH = 12;
  let y = yInicial;

  const desenharCabecalho = () => {
    doc.rect(x0, y, CONTENT_WIDTH, headerH).fillOpacity(1).fill("#eee").stroke("#000");
    doc.fillColor("#000");
    let x = x0;
    for (const col of COLS_ITEM) {
      const w = CONTENT_WIDTH * col.largura;
      doc
        .font("Helvetica-Bold")
        .fontSize(5.5)
        .text(col.titulo, x + 2, y + 3, { width: w - 4, align: col.align ?? "left" });
      x += w;
    }
    y += headerH;
  };

  desenharCabecalho();

  for (const item of itens) {
    if (y + rowH > 780) {
      doc.addPage();
      y = MARGIN;
      desenharCabecalho();
    }
    doc.rect(x0, y, CONTENT_WIDTH, rowH).stroke("#999");
    let x = x0;
    const valores = [
      item.codigo,
      item.descricao,
      item.ncm,
      item.cstIcms,
      item.cfop,
      item.unidade,
      item.quantidade,
      fmtMoeda(item.valorUnitario),
      fmtMoeda(item.valorTotal),
      fmtMoeda(item.valorIcms),
    ];
    COLS_ITEM.forEach((col, i) => {
      const w = CONTENT_WIDTH * col.largura;
      doc
        .font("Helvetica")
        .fontSize(6.5)
        .text(valores[i], x + 2, y + 3, {
          width: w - 4,
          height: 8,
          align: col.align ?? "left",
          ellipsis: true,
        });
      x += w;
    });
    y += rowH;
  }

  return y + 4;
}
