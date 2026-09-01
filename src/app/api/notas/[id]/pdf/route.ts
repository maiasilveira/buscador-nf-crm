import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseProcNFeDanfe } from "@/lib/sefaz/parse-danfe";
import { gerarDanfePdf } from "@/lib/pdf/danfe";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const nota = await prisma.notaFiscal.findUnique({
    where: { id },
    select: { chaveAcesso: true, xmlCompleto: true },
  });
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }
  if (!nota.xmlCompleto) {
    // O DANFE precisa dos itens/impostos, que só vêm no XML completo
    // (procNFe) — não dá pra montar a partir do resumo (resNFe).
    return NextResponse.json(
      { error: "PDF ainda não disponível — aguardando o XML completo (procNFe) da SEFAZ." },
      { status: 404 }
    );
  }

  try {
    const dados = parseProcNFeDanfe(nota.xmlCompleto);
    const pdf = await gerarDanfePdf(dados);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DANFE-${nota.chaveAcesso}.pdf"`,
      },
    });
  } catch (err) {
    console.error(`Falha ao gerar DANFE da nota ${id}:`, err);
    return NextResponse.json({ error: "Falha ao gerar o PDF." }, { status: 500 });
  }
}
