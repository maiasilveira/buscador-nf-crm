import "server-only";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import type { DadosDanfse } from "@/lib/nfse/parse-danfse";

// Gera um PDF no estilo DANFSe (Documento Auxiliar da NFS-e, padrão
// nacional) a partir dos dados extraídos do XML — ver
// src/lib/nfse/parse-danfse.ts.
//
// MESMO CAVEAT do parser: a estrutura exata do XML da NFS-e nacional não
// foi validada contra um documento real nesta sessão, então alguns campos
// podem vir vazios até essa confirmação (veja README). O layout aqui é uma
// representação organizada e completa dos dados, não uma réplica
// pixel-a-pixel do leiaute oficial do Ambiente de Dados Nacional.
//
// O QR code codifica a chave de acesso (não uma URL de consulta pública —
// o formato exato dessa URL no ADN não foi confirmado nesta sessão).

const MARGIN = 32;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function fmtMoeda(valor: string): string {
  const n = Number(valor);
  return Number.isFinite(n)
    ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : valor;
}

function fmtData(data: Date): string {
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleDateString("pt-BR");
}

function fmtDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return doc;
}

function campo(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  rotulo: string,
  valor: string
) {
  // height + ellipsis: mesmo motivo do helper equivalente em pdf/danfe.ts —
  // nem rótulo nem valor podem quebrar de linha nesses quadros compactos.
  doc
    .font("Helvetica")
    .fontSize(5.5)
    .fillColor("#666")
    .text(rotulo, x, y, { width: w, height: 6, ellipsis: true });
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#000")
    .text(valor || "-", x, y + 7, { width: w, height: 9, ellipsis: true });
}

function caixa(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).stroke("#000");
}

function secaoTitulo(doc: PDFKit.PDFDocument, x: number, y: number, texto: string) {
  doc.font("Helvetica-Bold").fontSize(6).fillColor("#555").text(texto.toUpperCase(), x, y);
}

export async function gerarDanfsePdf(dados: DadosDanfse): Promise<Buffer> {
  const qrDataUrl = await QRCode.toBuffer(dados.chaveAcesso || "sem-chave", {
    margin: 0,
    scale: 3,
  });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: MARGIN });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    let y = MARGIN;
    const x0 = MARGIN;

    // --- Cabeçalho: prestador | DANFSe | QR code -------------------------
    const headerH = 84;
    const colPrestW = CONTENT_WIDTH * 0.45;
    const colTituloW = CONTENT_WIDTH * 0.25;
    const colQrW = CONTENT_WIDTH - colPrestW - colTituloW;

    caixa(doc, x0, y, colPrestW, headerH);
    // height + ellipsis: um nome comprido não pode quebrar de linha e
    // invadir o endereço logo abaixo (visto num teste com nome de 40+
    // caracteres).
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .text(dados.prestadorNome, x0 + 6, y + 6, {
        width: colPrestW - 12,
        height: 13,
        ellipsis: true,
      });
    const pend = dados.prestadorEndereco;
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .text(
        `${pend.logradouro}, ${pend.numero}${pend.complemento ? " - " + pend.complemento : ""}`,
        x0 + 6,
        y + 22,
        { width: colPrestW - 12 }
      )
      .text(`${pend.bairro} - ${pend.municipio}/${pend.uf} - CEP ${pend.cep}`, x0 + 6, y + 34, {
        width: colPrestW - 12,
      })
      .text(`CNPJ: ${fmtDocumento(dados.prestadorCnpj)}   IM: ${dados.prestadorIm || "-"}`, x0 + 6, y + 48, {
        width: colPrestW - 12,
      });

    const xTitulo = x0 + colPrestW;
    caixa(doc, xTitulo, y, colTituloW, headerH);
    doc.font("Helvetica-Bold").fontSize(15).text("DANFSe", xTitulo, y + 8, {
      width: colTituloW,
      align: "center",
    });
    doc
      .font("Helvetica")
      .fontSize(6)
      .text("Documento Auxiliar da NFS-e", xTitulo + 4, y + 26, {
        width: colTituloW - 8,
        align: "center",
      });
    doc
      .font("Helvetica-Bold")
      .fontSize(9)
      .text(`Nº ${dados.numero}`, xTitulo + 4, y + 44, { width: colTituloW - 8, align: "center" });
    if (dados.tpAmbiente === "2") {
      doc
        .font("Helvetica-Bold")
        .fontSize(6)
        .fillColor("#b00")
        .text("HOMOLOGAÇÃO — SEM VALOR FISCAL", xTitulo + 4, y + 62, {
          width: colTituloW - 8,
          align: "center",
        })
        .fillColor("#000");
    }

    const xQr = xTitulo + colTituloW;
    caixa(doc, xQr, y, colQrW, headerH);
    const qrSize = Math.min(colQrW - 12, headerH - 24);
    doc.image(qrDataUrl, xQr + (colQrW - qrSize) / 2, y + 6, { width: qrSize, height: qrSize });
    doc
      .font("Helvetica")
      .fontSize(5)
      .text(dados.chaveAcesso, xQr + 4, y + headerH - 16, { width: colQrW - 8, align: "center" });
    y += headerH + 4;

    // --- Prestador / Tomador --------------------------------------------
    secaoTitulo(doc, x0, y, "Tomador do Serviço");
    y += 8;
    const tomH = 34;
    caixa(doc, x0, y, CONTENT_WIDTH, tomH);
    campo(doc, x0 + 4, y + 2, CONTENT_WIDTH * 0.55, "NOME/RAZÃO SOCIAL", dados.tomadorNome);
    campo(doc, x0 + CONTENT_WIDTH * 0.55, y + 2, CONTENT_WIDTH * 0.25, "CNPJ/CPF", fmtDocumento(dados.tomadorDocumento));
    campo(doc, x0 + CONTENT_WIDTH * 0.8, y + 2, CONTENT_WIDTH * 0.2, "DATA EMISSÃO", fmtData(dados.dataEmissao));
    const tend = dados.tomadorEndereco;
    campo(
      doc,
      x0 + 4,
      y + 18,
      CONTENT_WIDTH * 0.8,
      "ENDEREÇO",
      tend.logradouro
        ? `${tend.logradouro}, ${tend.numero} - ${tend.bairro} - ${tend.municipio}/${tend.uf}`
        : "-"
    );
    campo(doc, x0 + CONTENT_WIDTH * 0.8, y + 18, CONTENT_WIDTH * 0.2, "COMPETÊNCIA", dados.competencia);
    y += tomH + 4;

    // --- Serviço -----------------------------------------------------
    secaoTitulo(doc, x0, y, "Discriminação do Serviço");
    y += 8;
    const servH = 40;
    caixa(doc, x0, y, CONTENT_WIDTH, servH);
    campo(doc, x0 + 4, y + 2, CONTENT_WIDTH * 0.2, "CÓD. SERVIÇO", dados.codigoServico);
    campo(doc, x0 + CONTENT_WIDTH * 0.2, y + 2, CONTENT_WIDTH * 0.3, "MUNICÍPIO DA PRESTAÇÃO", dados.municipioPrestacao);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#000")
      .text(dados.descricaoServico || "-", x0 + 4, y + 18, { width: CONTENT_WIDTH - 8 });
    y += servH + 4;

    // --- Valores -------------------------------------------------------
    secaoTitulo(doc, x0, y, "Valores e Tributos");
    y += 8;
    const valH = 40;
    caixa(doc, x0, y, CONTENT_WIDTH, valH);
    const linha1: [string, string][] = [
      ["VALOR DO SERVIÇO", dados.valorServico],
      ["DESCONTOS", dados.valorDesconto],
      ["BASE DE CÁLC. ISS", dados.baseCalculoIss],
      ["ALÍQUOTA ISS", `${dados.aliquotaIss}%`],
      ["VALOR DO ISS", dados.valorIss],
    ];
    const linha2: [string, string][] = [
      ["PIS", dados.valorPis],
      ["COFINS", dados.valorCofins],
      ["IR", dados.valorIr],
      ["INSS", dados.valorInss],
      ["CSLL", dados.valorCsll],
      ["VALOR LÍQUIDO", dados.valorLiquido],
    ];
    const w1 = CONTENT_WIDTH / linha1.length;
    linha1.forEach(([rotulo, valor], i) =>
      campo(doc, x0 + 4 + i * w1, y + 2, w1 - 4, rotulo, rotulo.includes("ALÍQUOTA") ? valor : `R$ ${fmtMoeda(valor)}`)
    );
    const w2 = CONTENT_WIDTH / linha2.length;
    linha2.forEach(([rotulo, valor], i) =>
      campo(doc, x0 + 4 + i * w2, y + 21, w2 - 4, rotulo, `R$ ${fmtMoeda(valor)}`)
    );
    if (dados.issRetido) {
      doc
        .font("Helvetica-Bold")
        .fontSize(6)
        .fillColor("#b00")
        .text("ISS RETIDO NA FONTE PELO TOMADOR", x0 + 4, y + valH - 8)
        .fillColor("#000");
    }
    y += valH + 4;

    // --- Informações complementares -------------------------------------
    if (dados.informacoesComplementares) {
      secaoTitulo(doc, x0, y, "Informações Complementares");
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
