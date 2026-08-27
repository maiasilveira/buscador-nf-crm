import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await requireUser();
  const { id } = await params;
  const tipo = request.nextUrl.searchParams.get("tipo") === "completo" ? "completo" : "resumo";

  const nota = await prisma.notaFiscal.findUnique({
    where: { id },
    select: { chaveAcesso: true, xmlResumo: true, xmlCompleto: true },
  });
  if (!nota) {
    return NextResponse.json({ error: "Nota não encontrada." }, { status: 404 });
  }

  const xml = tipo === "completo" ? nota.xmlCompleto : nota.xmlResumo;
  if (!xml) {
    return NextResponse.json({ error: "XML não disponível." }, { status: 404 });
  }

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nota.chaveAcesso}-${tipo}.xml"`,
    },
  });
}
