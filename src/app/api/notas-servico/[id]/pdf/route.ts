import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { parseNfseDanfse } from "@/lib/nfse/parse-danfse";
import { gerarDanfsePdf } from "@/lib/pdf/danfse";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;

  const nota = await prisma.notaServico.findUnique({
    where: { id },
    select: { chaveAcesso: true, xmlCompleto: true },
  });
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  try {
    const dados = parseNfseDanfse(nota.xmlCompleto);
    const pdf = await gerarDanfsePdf(dados);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="DANFSe-${nota.chaveAcesso || id}.pdf"`,
      },
    });
  } catch (err) {
    console.error(`Falha ao gerar DANFSe da nota ${id}:`, err);
    return NextResponse.json({ error: "Falha ao gerar o PDF." }, { status: 500 });
  }
}
